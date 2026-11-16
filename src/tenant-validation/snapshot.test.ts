// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ConnectionBinding, OperationIdentity } from '@/appfolio/execute'

const state = vi.hoisted(() => ({
  run: vi.fn<
    (...args: unknown[]) => Promise<{ status: number; data: unknown }>
  >(),
  bound: vi.fn<
    () => Promise<{
      grant: { clientId: string }
      connection: ConnectionBinding
    }>
  >(),
  readFails: false,
  writeFails: false,
  afterWrite: undefined as (() => void) | undefined,
  writes: [] as { ttl?: number; name?: string }[],
}))
vi.mock('@/appfolio/execute', () => ({ runOperation: state.run }))
vi.mock('@/server/grants', () => ({ activeGrant: state.bound }))
vi.mock('@vercel/functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vercel/functions')>()
  return {
    ...actual,
    getCache: (options: Parameters<typeof actual.getCache>[0]) => {
      const real = actual.getCache(options)
      return {
        ...real,
        get: async (key: string) => {
          if (state.readFails) throw new Error('Cache read unavailable')
          return real.get(key)
        },
        set: async (...args: Parameters<typeof real.set>) => {
          if (state.writeFails) throw new Error('Cache write unavailable')
          state.writes.push({ ttl: args[2]?.ttl, name: args[2]?.name })
          await real.set(...args)
          state.afterWrite?.()
        },
      }
    },
  }
})

import { getCache } from '@vercel/functions'
import { encrypt, decrypt } from '@/server/crypto'
import { cacheTtlSeconds, snapshotKey, tenantSnapshot } from './snapshot'
import { evaluateTenant } from './matching'

const tenant = {
  Id: '11111111-1111-4111-8111-111111111111',
  UnitId: '22222222-2222-4222-8222-222222222222',
  OccupancyId: '33333333-3333-4333-8333-333333333333',
  FirstName: 'Avery',
  LastName: 'Tenant',
  Status: 'Current',
  PhoneNumbers: [{ Number: '4155550101' }],
  SocialSecurityNumber: 'unnecessary-secret',
  BirthDate: '2000-01-01',
}
const unit = {
  Id: tenant.UnitId,
  Address1: '960 Market Street #709',
  City: 'San Francisco',
  State: 'CA',
  Zip: '94102',
  MaintenanceNotes: 'unnecessary-private-notes',
}
const input = {
  firstName: tenant.FirstName,
  lastName: tenant.LastName,
  phoneNumber: '4155550101',
  address: { city: unit.City, streetAddress: '960 Market St', unit: '709' },
}
let now = 1800000000000
let identity: OperationIdentity
let connection: ConnectionBinding
const cache = () =>
  getCache({
    namespace: 'tenant-validation-v2',
    keyHashFunction: (key) => createHash('sha256').update(key).digest('hex'),
  })
const key = (resource = 'tenants') =>
  snapshotKey(identity.userId, connection, resource)
function page(data: unknown[], next?: string | null) {
  return { status: 200, data: { data, next_page_path: next } }
}
async function storeSnapshot(value: unknown) {
  await cache().set(key(), encrypt(JSON.stringify(value), key()), {
    ttl: 604800,
  })
}
function snapshotAt(fetchedAt = now) {
  return { fetchedAt, tenants: [tenant] }
}
beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_URL', 'https://snapshot-tests.example')
  vi.stubEnv('VERCEL_ENV', 'test')
  vi.stubEnv('CREDENTIAL_KEYS', JSON.stringify({ v1: 'a'.repeat(64) }))
  vi.stubEnv('CREDENTIAL_KEY_ID', 'v1')
  vi.stubEnv('RUNTIME_CACHE_DISABLE_BUILD_CACHE', 'true')
  vi.stubEnv('TENANT_VALIDATION_CACHE_TTL_SECONDS', '43200')
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network request')
    }),
  )
  now = 1800000000000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  identity = {
    userId: randomUUID(),
    grantId: 'grant-a',
    clientId: 'agent',
    correlationId: 'request',
  }
  connection = { id: randomUUID(), version: 1 }
  state.readFails = false
  state.writeFails = false
  state.afterWrite = undefined
  state.writes = []
  state.bound.mockReset().mockImplementation(async () => ({
    grant: { clientId: identity.clientId },
    connection: { ...connection },
  }))
  state.run.mockReset().mockImplementation(async (...args) => {
    const op = z.object({ name: z.string() }).parse(args[0])
    return page(op.name === 'getTenants' ? [tenant] : [unit])
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function storeUnit(value = { fetchedAt: now, unit }) {
  const unitKey = key('unit:' + value.unit.Id)
  await cache().set(unitKey, encrypt(JSON.stringify(value), unitKey), {
    ttl: 604800,
  })
}
async function warm() {
  await storeSnapshot(snapshotAt())
  await storeUnit()
}
function bound() {
  return {
    grant: { clientId: identity.clientId },
    connection: { ...connection },
  }
}
function callsTo(name: string) {
  return state.run.mock.calls.filter(
    (call) => z.object({ name: z.string() }).parse(call[0]).name === name,
  )
}

describe('tenant-first lazy unit retrieval', () => {
  it('loads a tenant inventory and only the qualifying unit, then uses both cached entries', async () => {
    expect((await tenantSnapshot(identity, input)).cache).toBe('miss')
    expect(state.run).toHaveBeenCalledTimes(2)
    expect(state.run.mock.calls[1]?.[1]).toEqual({
      query: {
        filters: { Id: tenant.UnitId },
        page: { number: 1, size: 1000 },
      },
    })
    expect(state.writes.map((write) => write.name)).toEqual([
      'tenant-validation-tenants',
      'tenant-validation-unit',
    ])
    state.run.mockClear()
    const second = await tenantSnapshot(identity, input)
    expect(second.cache).toBe('hit')
    expect(evaluateTenant(input, second.tenants, second.units).status).toBe(
      'authenticated',
    )
    expect(state.run).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    { ...input, firstName: 'Wrong' },
    { ...input, phoneNumber: '4155559999' },
    { ...input, phoneNumber: '4155559999', email: 'avery@example.com' },
  ])(
    'never looks up units without first name and phone matching',
    async (evidence) => {
      const result = await tenantSnapshot(identity, evidence)
      expect(result.units).toEqual([])
      expect(state.run).toHaveBeenCalledTimes(1)
      expect(callsTo('getUnits')).toHaveLength(0)
    },
  )
  it('keeps the tenant inventory cached when a qualifying unit fails and retries only that unit later', async () => {
    state.run
      .mockResolvedValueOnce(page([tenant]))
      .mockRejectedValueOnce(new Error('unit unavailable'))
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'unit unavailable',
    )
    expect(await cache().get(key())).not.toBeNull()
    expect(await cache().get(key('unit:' + unit.Id))).toBeNull()
    state.run.mockClear()
    expect((await tenantSnapshot(identity, input)).units).toHaveLength(1)
    expect(callsTo('getTenants')).toHaveLength(0)
    expect(callsTo('getUnits')).toHaveLength(1)
  })
  it('does not cache a missing unit as a negative result', async () => {
    await storeSnapshot(snapshotAt())
    state.run.mockResolvedValueOnce(page([]))
    const missing = await tenantSnapshot(identity, input)
    expect(evaluateTenant(input, missing.tenants, missing.units)).toMatchObject(
      { status: 'needs_review', error: { failureClass: 'unit_not_found' } },
    )
    expect(await cache().get(key('unit:' + unit.Id))).toBeNull()
    expect((await tenantSnapshot(identity, input)).units).toHaveLength(1)
    expect(callsTo('getUnits')).toHaveLength(2)
  })
  it('does not request unrelated units from the tenant inventory', async () => {
    const other = {
      ...tenant,
      Id: randomUUID(),
      FirstName: 'Another',
      UnitId: randomUUID(),
    }
    state.run.mockResolvedValueOnce(page([tenant, other]))
    const result = await tenantSnapshot(identity, input)
    expect(result.units).toHaveLength(1)
    const request = z
      .object({ query: z.object({ filters: z.object({ Id: z.string() }) }) })
      .parse(state.run.mock.calls[1]?.[1])
    expect(request.query.filters.Id).toBe(tenant.UnitId)
  })
  it('preserves both independently cached units during concurrent requests', async () => {
    const otherTenant = {
      ...tenant,
      Id: randomUUID(),
      FirstName: 'Other',
      UnitId: randomUUID(),
    }
    const otherUnit = {
      ...unit,
      Id: otherTenant.UnitId,
      Address1: '100 Other Street #1',
    }
    await storeSnapshot({ fetchedAt: now, tenants: [tenant, otherTenant] })
    state.run.mockImplementation(async (...args) => {
      const request = z
        .object({ query: z.object({ filters: z.object({ Id: z.string() }) }) })
        .parse(args[1])
      return page(request.query.filters.Id === unit.Id ? [unit] : [otherUnit])
    })
    await Promise.all([
      tenantSnapshot(identity, input),
      tenantSnapshot(identity, {
        ...input,
        firstName: 'Other',
        address: { city: unit.City, streetAddress: '100 Other St', unit: '1' },
      }),
    ])
    expect(callsTo('getTenants')).toHaveLength(0)
    expect(callsTo('getUnits')).toHaveLength(2)
    expect(await cache().get(key('unit:' + unit.Id))).not.toBeNull()
    expect(await cache().get(key('unit:' + otherUnit.Id))).not.toBeNull()
  })
})

describe('resource TTL and freshness', () => {
  it('defaults to twelve hours and accepts an override', () => {
    delete process.env.TENANT_VALIDATION_CACHE_TTL_SECONDS
    expect(cacheTtlSeconds()).toBe(43200)
    vi.stubEnv('TENANT_VALIDATION_CACHE_TTL_SECONDS', '120')
    expect(cacheTtlSeconds()).toBe(120)
  })
  it.each(['', '0', '-1', '1.5', '1e3', ' 120', '604801', '9007199254740993'])(
    'rejects invalid TTL %j',
    (value) => {
      vi.stubEnv('TENANT_VALIDATION_CACHE_TTL_SECONDS', value)
      expect(cacheTtlSeconds).toThrow('invalid_tenant_cache_ttl')
    },
  )
  it('refills only an expired tenant inventory and retains a fresh matched unit', async () => {
    await storeSnapshot(snapshotAt(now - 43200000))
    await storeUnit()
    expect((await tenantSnapshot(identity, input)).cache).toBe('miss')
    expect(callsTo('getTenants')).toHaveLength(1)
    expect(callsTo('getUnits')).toHaveLength(0)
  })
  it('refills only an expired unit and retains the tenant inventory', async () => {
    await storeSnapshot(snapshotAt())
    await storeUnit({ fetchedAt: now - 43200000, unit })
    expect((await tenantSnapshot(identity, input)).cache).toBe('miss')
    expect(callsTo('getTenants')).toHaveLength(0)
    expect(callsTo('getUnits')).toHaveLength(1)
  })
  it('reports the oldest source age while both entries are still fresh', async () => {
    await storeSnapshot(snapshotAt(now - 30000))
    await storeUnit({ fetchedAt: now - 50000, unit })
    const value = await tenantSnapshot(identity, input)
    expect(value.fetchedAt).toBe(now - 50000)
    expect(value.cache).toBe('hit')
    expect(state.run).not.toHaveBeenCalled()
  })
  it('applies a shortened TTL to previously retained unit entries', async () => {
    await storeSnapshot(snapshotAt())
    await storeUnit({ fetchedAt: now - 40000, unit })
    vi.stubEnv('TENANT_VALIDATION_CACHE_TTL_SECONDS', '30')
    await tenantSnapshot(identity, input)
    expect(callsTo('getTenants')).toHaveLength(0)
    expect(callsTo('getUnits')).toHaveLength(1)
  })
  it('rejects entries with future timestamps', async () => {
    await storeSnapshot(snapshotAt(now + 1))
    await storeUnit()
    await tenantSnapshot(identity, input)
    expect(callsTo('getTenants')).toHaveLength(1)
  })
  it('subtracts fetch time from the stored TTL', async () => {
    state.run.mockImplementationOnce(async () => {
      now += 2500
      return page([tenant])
    })
    await tenantSnapshot(identity, input)
    expect(state.writes.map((write) => write.ttl)).toEqual([43197, 43200])
  })
  it('rejects data expiring during the final grant check', async () => {
    await storeSnapshot(snapshotAt(now - 43200000 + 1))
    await storeUnit()
    state.bound
      .mockResolvedValueOnce(bound())
      .mockImplementationOnce(async () => {
        now += 2
        return bound()
      })
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'tenant_inventory_expired_during_load',
    )
  })
  it('does not publish an inventory that expired during loading', async () => {
    vi.stubEnv('TENANT_VALIDATION_CACHE_TTL_SECONDS', '1')
    state.run.mockImplementationOnce(async () => {
      now += 1000
      return page([tenant])
    })
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'tenant_inventory_expired_during_load',
    )
    expect(await cache().get(key())).toBeNull()
  })
})

describe('authorization and cache integrity', () => {
  it('isolates owner, connection, credential version, origin, environment and resource', () => {
    const original = key()
    expect(snapshotKey('other', connection)).not.toBe(original)
    expect(
      snapshotKey(identity.userId, { ...connection, id: 'other' }),
    ).not.toBe(original)
    expect(
      snapshotKey(identity.userId, { ...connection, version: 2 }),
    ).not.toBe(original)
    expect(key('unit:' + unit.Id)).not.toBe(original)
    expect(key('unit:' + randomUUID())).not.toBe(key('unit:' + unit.Id))
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(key()).not.toBe(original)
    vi.stubEnv('VERCEL_ENV', 'test')
    vi.stubEnv('BETTER_AUTH_URL', 'https://other.example')
    expect(key()).not.toBe(original)
  })
  it('rejects a wrong client and a revoked grant before loading data', async () => {
    state.bound.mockResolvedValueOnce({
      grant: { clientId: 'other' },
      connection,
    })
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'invalid_authorization',
    )
    state.bound.mockRejectedValueOnce(
      new Error('authorization_removed_reauthorize'),
    )
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'authorization_removed_reauthorize',
    )
    expect(state.run).not.toHaveBeenCalled()
  })
  it('rejects revocation while reading cached resources', async () => {
    await warm()
    state.bound
      .mockResolvedValueOnce(bound())
      .mockRejectedValueOnce(new Error('authorization_removed_reauthorize'))
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'authorization_removed_reauthorize',
    )
    expect(state.run).not.toHaveBeenCalled()
  })
  it('rejects a connection change before publishing fetched tenant data', async () => {
    const originalKey = key()
    state.run.mockImplementationOnce(async () => {
      connection.version++
      return page([tenant])
    })
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'connection_changed_retry',
    )
    expect(await cache().get(originalKey)).toBeNull()
  })
  it('rejects a connection change before publishing fetched unit data', async () => {
    await storeSnapshot(snapshotAt())
    const unitKey = key('unit:' + unit.Id)
    state.run.mockImplementationOnce(async () => {
      connection.version++
      return page([unit])
    })
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'connection_changed_retry',
    )
    expect(await cache().get(unitKey)).toBeNull()
  })
  it('never reuses snapshots from an earlier credential version', async () => {
    await warm()
    connection.version++
    expect((await tenantSnapshot(identity, input)).cache).toBe('miss')
    expect(state.run).toHaveBeenCalledTimes(2)
  })
  it.each(['plaintext', { not: 'a snapshot' }])(
    'refills corrupt tenant cache %j',
    async (value) => {
      await cache().set(key(), value)
      await tenantSnapshot(identity, input)
      expect(callsTo('getTenants')).toHaveLength(1)
    },
  )
  it('refills a unit ciphertext copied from another resource', async () => {
    await storeSnapshot(snapshotAt())
    await cache().set(key('unit:' + unit.Id), await cache().get(key()))
    await tenantSnapshot(identity, input)
    expect(callsTo('getTenants')).toHaveLength(0)
    expect(callsTo('getUnits')).toHaveLength(1)
  })
  it('does not use a cached unit with a different ID', async () => {
    await storeSnapshot(snapshotAt())
    const unitKey = key('unit:' + unit.Id)
    await cache().set(
      unitKey,
      encrypt(
        JSON.stringify({ fetchedAt: now, unit: { ...unit, Id: randomUUID() } }),
        unitKey,
      ),
    )
    await tenantSnapshot(identity, input)
    expect(callsTo('getUnits')).toHaveLength(1)
  })
  it('refills after removing the old encryption key', async () => {
    await warm()
    vi.stubEnv('CREDENTIAL_KEYS', JSON.stringify({ v2: 'b'.repeat(64) }))
    vi.stubEnv('CREDENTIAL_KEY_ID', 'v2')
    expect((await tenantSnapshot(identity, input)).cache).toBe('miss')
    expect(state.run).toHaveBeenCalledTimes(2)
  })
  it('stores matching fields encrypted without unrelated personal data', async () => {
    await tenantSnapshot(identity, input)
    const tenantCipher = await cache().get(key())
    const unitKey = key('unit:' + unit.Id)
    const unitCipher = await cache().get(unitKey)
    if (typeof tenantCipher !== 'string' || typeof unitCipher !== 'string')
      throw new Error('Expected encrypted resources')
    expect(tenantCipher).not.toContain(tenant.FirstName)
    const tenantData = decrypt(tenantCipher, key())
    const unitData = decrypt(unitCipher, unitKey)
    expect(tenantData).not.toContain('unnecessary-secret')
    expect(tenantData).not.toContain('BirthDate')
    expect(tenantData).not.toContain('units')
    expect(unitData).not.toContain('unnecessary-private-notes')
    expect(unitData).not.toContain('tenants')
  })
  it('can serve fresh data when cache reads or writes fail', async () => {
    state.readFails = true
    expect((await tenantSnapshot(identity, input)).units).toHaveLength(1)
    state.readFails = false
    state.writeFails = true
    connection.version++
    expect((await tenantSnapshot(identity, input)).units).toHaveLength(1)
  })
})

describe('bounded complete resource loading', () => {
  it('loads every tenant page before caching and retains filters', async () => {
    state.run
      .mockResolvedValueOnce(page([tenant], '/api/v0/tenants?page[number]=2'))
      .mockResolvedValueOnce(page([{ ...tenant, Id: randomUUID() }]))
    const result = await tenantSnapshot(identity, input)
    expect(result.tenants).toHaveLength(2)
    expect(callsTo('getUnits')).toHaveLength(1)
    expect(state.run.mock.calls[1]?.[1]).toEqual({
      query: {
        filters: {
          LastUpdatedAtFrom: '1970-01-01T00:00:00Z',
          Status: 'Current',
        },
        page: { number: 2, size: 1000 },
      },
    })
  })
  it('does not cache a partial tenant inventory', async () => {
    state.run
      .mockResolvedValueOnce(page([tenant], '/api/v0/tenants?page[number]=2'))
      .mockRejectedValueOnce(new Error('upstream unavailable'))
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'upstream unavailable',
    )
    expect(await cache().get(key())).toBeNull()
    expect(callsTo('getUnits')).toHaveLength(0)
  })
  it('does not publish unit data after a later unit page fails', async () => {
    await storeSnapshot(snapshotAt())
    state.run
      .mockResolvedValueOnce(page([unit], '/api/v0/units?page[number]=2'))
      .mockRejectedValueOnce(new Error('unit page failed'))
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'unit page failed',
    )
    expect(await cache().get(key('unit:' + unit.Id))).toBeNull()
    expect(await cache().get(key())).not.toBeNull()
  })
  it.each([403, 429, 500])(
    'does not cache tenant HTTP error %s',
    async (status) => {
      state.run.mockResolvedValueOnce({ status, data: {} })
      await expect(tenantSnapshot(identity, input)).rejects.toThrow(
        'tenant_inventory_unavailable',
      )
      expect(await cache().get(key())).toBeNull()
    },
  )
  it.each([
    'https://attacker.example/api/v0/tenants?page[number]=2',
    'http://api.appfolio.com/api/v0/tenants?page[number]=2',
    '/api/v0/units?page[number]=2',
    '/api/v0/tenants?page[number]=3',
    '/api/v0/tenants?page[number]=1',
    '/api/v0/tenants',
  ])('rejects unsafe or nonsequential pagination %s', async (next) => {
    state.run.mockResolvedValueOnce(page([tenant], next))
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'tenant_pagination_invalid',
    )
    expect(await cache().get(key())).toBeNull()
  })
  it('rejects repeated pagination paths', async () => {
    state.run
      .mockResolvedValueOnce(page([tenant], '/api/v0/tenants?page[number]=2'))
      .mockResolvedValueOnce(page([tenant], '/api/v0/tenants?page[number]=2'))
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'tenant_pagination_repeated',
    )
  })
  it('enforces the page and record budgets', async () => {
    let number = 1
    state.run.mockImplementation(async () =>
      page([tenant], '/api/v0/tenants?page[number]=' + ++number),
    )
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'tenant_inventory_incomplete',
    )
    expect(state.run).toHaveBeenCalledTimes(20)
    state.run.mockResolvedValueOnce(
      page(Array.from({ length: 20001 }, () => tenant)),
    )
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'tenant_inventory_incomplete',
    )
  })
  it('rejects a unit response arriving after the request deadline', async () => {
    await storeSnapshot(snapshotAt())
    state.run.mockImplementationOnce(async () => {
      now += 60001
      return page([unit])
    })
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'tenant_inventory_incomplete',
    )
    expect(await cache().get(key('unit:' + unit.Id))).toBeNull()
  })
  it.each([
    { units: [{ ...unit, Id: 'invalid' }], error: undefined },
    {
      units: [{ ...unit, Id: '44444444-4444-4444-8444-444444444444' }],
      error: 'tenant_unit_response_mismatch',
    },
    { units: [unit, unit], error: 'tenant_unit_response_mismatch' },
  ])(
    'rejects malformed, unrelated or duplicate unit responses',
    async ({ units, error }) => {
      await storeSnapshot(snapshotAt())
      state.run.mockResolvedValueOnce(page(units))
      await expect(tenantSnapshot(identity, input)).rejects.toThrow(error)
      expect(await cache().get(key('unit:' + unit.Id))).toBeNull()
    },
  )
  it('bounds encrypted tenant cache size', async () => {
    state.run.mockResolvedValueOnce(
      page([{ ...tenant, FirstName: 'x'.repeat(1500000) }]),
    )
    await expect(tenantSnapshot(identity, input)).rejects.toThrow(
      'tenant_inventory_cache_too_large',
    )
    expect(await cache().get(key())).toBeNull()
  })
})
