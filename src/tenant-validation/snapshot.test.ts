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
    namespace: 'tenant-validation-v1',
    keyHashFunction: (key) => createHash('sha256').update(key).digest('hex'),
  })
const key = () => snapshotKey(identity.userId, connection)
function page(data: unknown[], next?: string | null) {
  return { status: 200, data: { data, next_page_path: next } }
}
async function storeSnapshot(value: unknown) {
  await cache().set(key(), encrypt(JSON.stringify(value), key()), {
    ttl: 604800,
  })
}
function snapshotAt(fetchedAt = now) {
  return { fetchedAt, tenants: [tenant], units: [unit] }
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

describe('shared tenant snapshot TTL', () => {
  it('defaults to twelve hours and accepts an explicit override', () => {
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
  it('fills once then matches from the real SDK local cache without upstream calls', async () => {
    const first = await tenantSnapshot(identity)
    expect(first.cache).toBe('miss')
    expect(state.run).toHaveBeenCalledTimes(2)
    expect(state.writes).toEqual([
      { ttl: 43200, name: 'tenant-validation-snapshot' },
    ])
    state.run.mockClear()
    const second = await tenantSnapshot(identity)
    expect(second.cache).toBe('hit')
    expect(evaluateTenant(input, second.tenants, second.units)).toMatchObject({
      status: 'authenticated',
      tenant: { occupancyId: tenant.OccupancyId },
    })
    expect(state.run).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('keeps entries just below twelve hours but expires at the exact boundary', async () => {
    await storeSnapshot(snapshotAt(now - 43200000 + 1))
    expect((await tenantSnapshot(identity)).cache).toBe('hit')
    now++
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
    expect(state.run).toHaveBeenCalledTimes(2)
  })
  it('applies a shortened TTL immediately even when the cache still retains the entry', async () => {
    await storeSnapshot(snapshotAt(now - 40000))
    vi.stubEnv('TENANT_VALIDATION_CACHE_TTL_SECONDS', '30')
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
    expect(state.run).toHaveBeenCalledTimes(2)
    expect(state.writes.at(-1)?.ttl).toBe(30)
  })
  it('does not accept a timestamp in the future', async () => {
    await storeSnapshot(snapshotAt(now + 1))
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
  })
  it('rechecks expiry after the live grant check on a prospective cache hit', async () => {
    await storeSnapshot(snapshotAt(now - 43200000 + 1))
    state.bound
      .mockResolvedValueOnce({
        grant: { clientId: identity.clientId },
        connection: { ...connection },
      })
      .mockImplementationOnce(async () => {
        now += 2
        return {
          grant: { clientId: identity.clientId },
          connection: { ...connection },
        }
      })
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
    expect(state.run).toHaveBeenCalledTimes(2)
  })
  it('subtracts fill time from the retention TTL', async () => {
    state.run.mockImplementationOnce(async () => {
      now += 2500
      return page([tenant])
    })
    await tenantSnapshot(identity)
    expect(state.writes.at(-1)?.ttl).toBe(43197)
  })
  it('does not publish data that expires while being loaded', async () => {
    vi.stubEnv('TENANT_VALIDATION_CACHE_TTL_SECONDS', '1')
    state.run.mockImplementationOnce(async () => {
      now += 1000
      return page([tenant])
    })
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'tenant_inventory_expired_during_load',
    )
    expect(await cache().get(key())).toBeNull()
  })
  it.each(['cache write', 'final grant check'])(
    'does not return a snapshot that expires during the %s',
    async (stage) => {
      vi.stubEnv('TENANT_VALIDATION_CACHE_TTL_SECONDS', '1')
      if (stage === 'cache write') {
        state.afterWrite = () => {
          now += 1000
        }
      } else {
        state.bound
          .mockResolvedValueOnce({
            grant: { clientId: identity.clientId },
            connection: { ...connection },
          })
          .mockResolvedValueOnce({
            grant: { clientId: identity.clientId },
            connection: { ...connection },
          })
          .mockImplementationOnce(async () => {
            now += 1000
            return {
              grant: { clientId: identity.clientId },
              connection: { ...connection },
            }
          })
      }
      await expect(tenantSnapshot(identity)).rejects.toThrow(
        'tenant_inventory_expired_during_load',
      )
      expect(state.run).toHaveBeenCalledTimes(2)
      expect(state.bound).toHaveBeenCalledTimes(3)
    },
  )
})

describe('cache isolation and authorization', () => {
  it('isolates the owner, connection, credential version, environment and origin', () => {
    const original = key()
    expect(snapshotKey('another-user', connection)).not.toBe(original)
    expect(
      snapshotKey(identity.userId, { ...connection, id: 'other' }),
    ).not.toBe(original)
    expect(
      snapshotKey(identity.userId, { ...connection, version: 2 }),
    ).not.toBe(original)
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(key()).not.toBe(original)
    vi.stubEnv('VERCEL_ENV', 'test')
    vi.stubEnv('BETTER_AUTH_URL', 'https://different.example')
    expect(key()).not.toBe(original)
  })
  it('never reuses another owner or connection version snapshot', async () => {
    await tenantSnapshot(identity)
    connection.version = 2
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
    identity.userId = randomUUID()
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
    expect(state.run).toHaveBeenCalledTimes(6)
  })
  it('rejects the wrong client before touching upstream', async () => {
    state.bound.mockResolvedValueOnce({
      grant: { clientId: 'other-client' },
      connection,
    })
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'invalid_authorization',
    )
    expect(state.run).not.toHaveBeenCalled()
  })
  it('does not serve a populated cache to a revoked grant', async () => {
    await tenantSnapshot(identity)
    state.run.mockClear()
    state.bound.mockRejectedValue(
      new Error('authorization_removed_reauthorize'),
    )
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'authorization_removed_reauthorize',
    )
    expect(state.run).not.toHaveBeenCalled()
  })
  it('rejects revocation during cache-hit authorization checks', async () => {
    await tenantSnapshot(identity)
    state.run.mockClear()
    state.bound
      .mockResolvedValueOnce({
        grant: { clientId: identity.clientId },
        connection,
      })
      .mockRejectedValueOnce(new Error('authorization_removed_reauthorize'))
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'authorization_removed_reauthorize',
    )
    expect(state.run).not.toHaveBeenCalled()
  })
  it('rejects a credential-version change while reading a cache hit', async () => {
    await tenantSnapshot(identity)
    state.bound
      .mockResolvedValueOnce({
        grant: { clientId: identity.clientId },
        connection: { ...connection },
      })
      .mockResolvedValueOnce({
        grant: { clientId: identity.clientId },
        connection: { ...connection, version: 2 },
      })
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'connection_changed_retry',
    )
  })
  it('does not publish a snapshot after connection changes during fill', async () => {
    const originalKey = key()
    state.bound
      .mockResolvedValueOnce({
        grant: { clientId: identity.clientId },
        connection: { ...connection },
      })
      .mockResolvedValueOnce({
        grant: { clientId: identity.clientId },
        connection: { ...connection, version: 2 },
      })
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'connection_changed_retry',
    )
    expect(await cache().get(originalKey)).toBeNull()
  })
  it('rejects revocation during fill before publishing', async () => {
    state.bound
      .mockResolvedValueOnce({
        grant: { clientId: identity.clientId },
        connection: { ...connection },
      })
      .mockRejectedValueOnce(new Error('authorization_removed_reauthorize'))
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'authorization_removed_reauthorize',
    )
    expect(await cache().get(key())).toBeNull()
  })
  it('rechecks the binding after the cache write', async () => {
    state.bound
      .mockResolvedValueOnce({
        grant: { clientId: identity.clientId },
        connection: { ...connection },
      })
      .mockResolvedValueOnce({
        grant: { clientId: identity.clientId },
        connection: { ...connection },
      })
      .mockRejectedValueOnce(new Error('authorization_removed_reauthorize'))
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'authorization_removed_reauthorize',
    )
  })
})

describe('snapshot integrity and cache outages', () => {
  it.each(['plaintext', { not: 'a snapshot' }])(
    'refills corrupt cache value %j',
    async (raw) => {
      await cache().set(key(), raw)
      expect((await tenantSnapshot(identity)).cache).toBe('miss')
      expect(state.run).toHaveBeenCalledTimes(2)
    },
  )
  it('refills encrypted values with an invalid snapshot schema', async () => {
    await storeSnapshot({
      fetchedAt: now,
      tenants: [{ Id: 'invalid' }],
      units: [],
    })
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
  })
  it('does not reuse ciphertext moved from another connection', async () => {
    const originalKey = key()
    await storeSnapshot(snapshotAt())
    const original = await cache().get(originalKey)
    connection.version = 2
    await cache().set(key(), original)
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
  })
  it('refills obsolete encryption keys rather than returning an error', async () => {
    await storeSnapshot(snapshotAt())
    vi.stubEnv('CREDENTIAL_KEYS', JSON.stringify({ v2: 'b'.repeat(64) }))
    vi.stubEnv('CREDENTIAL_KEY_ID', 'v2')
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
  })
  it('can complete fresh reads when the cache read fails', async () => {
    state.readFails = true
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
    expect(state.run).toHaveBeenCalledTimes(2)
  })
  it('can return fresh complete data when cache writes fail', async () => {
    state.writeFails = true
    const snapshot = await tenantSnapshot(identity)
    expect(snapshot.cache).toBe('miss')
    expect(snapshot.tenants).toHaveLength(1)
    expect(await cache().get(key())).toBeNull()
  })
  it('stores encrypted matching fields without unrelated personal or maintenance data', async () => {
    await tenantSnapshot(identity)
    const encrypted = await cache().get(key())
    expect(typeof encrypted).toBe('string')
    if (typeof encrypted !== 'string')
      throw new Error('Expected encrypted string')
    expect(encrypted).not.toContain(tenant.FirstName)
    expect(encrypted).not.toContain('4155550101')
    const decrypted = decrypt(encrypted, key())
    expect(decrypted).not.toContain(tenant.SocialSecurityNumber)
    expect(decrypted).not.toContain('BirthDate')
    expect(decrypted).not.toContain(unit.MaintenanceNotes)
    expect(decrypted).toContain(tenant.OccupancyId)
    expect(state.writes.at(-1)?.name).toBe('tenant-validation-snapshot')
  })
})

describe('bounded complete inventory loading', () => {
  it('loads all tenant pages and preserves filters while advancing page number', async () => {
    state.run
      .mockResolvedValueOnce(
        page([tenant], '/api/v0/tenants?page[number]=2&page[size]=1000'),
      )
      .mockResolvedValueOnce(
        page([{ ...tenant, Id: '44444444-4444-4444-8444-444444444444' }]),
      )
    const result = await tenantSnapshot(identity)
    expect(result.tenants).toHaveLength(2)
    expect(state.run.mock.calls[1]?.[1]).toEqual({
      query: {
        filters: {
          LastUpdatedAtFrom: '1970-01-01T00:00:00Z',
          Status: 'Current',
        },
        page: { number: 2, size: 1000 },
      },
    })
    expect(state.run.mock.calls[2]?.[1]).toEqual({
      query: {
        filters: { Id: tenant.UnitId },
        page: { number: 1, size: 1000 },
      },
    })
  })
  it('does not issue a unit query when the complete tenant inventory is empty', async () => {
    state.run.mockResolvedValueOnce(page([]))
    expect(await tenantSnapshot(identity)).toMatchObject({
      tenants: [],
      units: [],
    })
    expect(state.run).toHaveBeenCalledTimes(1)
  })
  it('batches unique unit IDs in groups of at most one hundred', async () => {
    const tenants = Array.from({ length: 101 }, () => ({
      ...tenant,
      Id: randomUUID(),
      UnitId: randomUUID(),
    }))
    state.run.mockImplementation(async (...args) => {
      const op = z.object({ name: z.string() }).parse(args[0])
      if (op.name === 'getTenants') return page(tenants)
      const request = z
        .object({ query: z.object({ filters: z.object({ Id: z.string() }) }) })
        .parse(args[1])
      return page(
        request.query.filters.Id.split(',').map((Id) => ({ ...unit, Id })),
      )
    })
    const result = await tenantSnapshot(identity)
    expect(result.units).toHaveLength(101)
    expect(state.run).toHaveBeenCalledTimes(3)
    for (const call of state.run.mock.calls.slice(1)) {
      const request = z
        .object({ query: z.object({ filters: z.object({ Id: z.string() }) }) })
        .parse(call[1])
      expect(request.query.filters.Id.split(',').length).toBeLessThanOrEqual(
        100,
      )
    }
  })
  it.each([403, 429, 500])(
    'never caches an upstream tenant error %s',
    async (status) => {
      state.run.mockResolvedValueOnce({ status, data: {} })
      await expect(tenantSnapshot(identity)).rejects.toThrow(
        'tenant_inventory_unavailable',
      )
      expect(await cache().get(key())).toBeNull()
    },
  )
  it('never caches a partial inventory after a later tenant-page failure', async () => {
    state.run
      .mockResolvedValueOnce(page([tenant], '/api/v0/tenants?page[number]=2'))
      .mockRejectedValueOnce(new Error('upstream_unavailable'))
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'upstream_unavailable',
    )
    expect(await cache().get(key())).toBeNull()
    expect((await tenantSnapshot(identity)).cache).toBe('miss')
  })
  it('never caches tenant-only data when fetching units fails', async () => {
    state.run
      .mockResolvedValueOnce(page([tenant]))
      .mockResolvedValueOnce({ status: 500, data: {} })
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'tenant_inventory_unavailable',
    )
    expect(await cache().get(key())).toBeNull()
  })
  it('never publishes malformed upstream records', async () => {
    state.run.mockResolvedValueOnce(page([{ ...tenant, Id: 'invalid' }]))
    await expect(tenantSnapshot(identity)).rejects.toThrow()
    expect(await cache().get(key())).toBeNull()
  })
  it.each([
    'https://attacker.example/api/v0/tenants?page[number]=2',
    'http://api.appfolio.com/api/v0/tenants?page[number]=2',
    '/api/v0/work_orders?page[number]=2',
    '/api/v0/tenants?page[number]=3',
    '/api/v0/tenants?page[number]=1',
    '/api/v0/tenants',
  ])('rejects unsafe or nonsequential pagination %s', async (path) => {
    state.run.mockResolvedValueOnce(page([tenant], path))
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'tenant_pagination_invalid',
    )
    expect(await cache().get(key())).toBeNull()
    expect(state.run).toHaveBeenCalledTimes(1)
  })
  it('rejects repeated pagination paths', async () => {
    const next = '/api/v0/tenants?page[number]=2'
    state.run
      .mockResolvedValueOnce(page([tenant], next))
      .mockResolvedValueOnce(page([tenant], next))
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'tenant_pagination_repeated',
    )
    expect(await cache().get(key())).toBeNull()
  })
  it('bounds the number of pages', async () => {
    let number = 1
    state.run.mockImplementation(async () =>
      page([tenant], '/api/v0/tenants?page[number]=' + ++number),
    )
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'tenant_inventory_incomplete',
    )
    expect(state.run).toHaveBeenCalledTimes(20)
    expect(await cache().get(key())).toBeNull()
  })
  it('bounds the number of tenant records', async () => {
    state.run.mockResolvedValueOnce(
      page(Array.from({ length: 20001 }, () => tenant)),
    )
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'tenant_inventory_incomplete',
    )
    expect(await cache().get(key())).toBeNull()
  })
  it('rejects a final unit response arriving after the inventory deadline', async () => {
    state.run
      .mockResolvedValueOnce(page([tenant]))
      .mockImplementationOnce(async () => {
        now += 60001
        return page([unit])
      })
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'tenant_inventory_incomplete',
    )
    expect(await cache().get(key())).toBeNull()
  })
  it('does not store an encrypted snapshot over the cache item size budget', async () => {
    state.run.mockResolvedValueOnce(
      page([{ ...tenant, FirstName: 'x'.repeat(1500000) }]),
    )
    await expect(tenantSnapshot(identity)).rejects.toThrow(
      'tenant_inventory_cache_too_large',
    )
    expect(await cache().get(key())).toBeNull()
  })
})
