// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
  it,
  vi,
} from 'vitest'
import { z } from 'zod'

const state = vi.hoisted(() => ({
  db: undefined as ReturnType<typeof drizzle> | undefined,
}))
vi.mock('@/db/index.server', () => ({ getDb: () => state.db }))
vi.mock('@/appfolio/execute', async (original) => {
  const actual = await original<typeof import('@/appfolio/execute')>()
  return { ...actual, runOperation: vi.fn() }
})
import { runOperation } from '@/appfolio/execute'
import { protocolHandler } from '@/mcp-server'
import { validateTenant } from './validate-tenant'

let pg: PGlite
const identity = {
  userId: 'validation-user',
  grantId: 'validation-grant',
  clientId: 'validation-client',
  correlationId: 'validation-request',
}
const tenantId = (index: number) =>
  '11111111-1111-4111-8111-' + String(index).padStart(12, '0')
const unitId = (index: number) =>
  '22222222-2222-4222-8222-' + String(index).padStart(12, '0')
const occupancyId = '33333333-3333-4333-8333-333333333333'
const evidence = {
  firstName: 'Resident0',
  phoneNumber: '4155550100',
  address: {
    streetAddress: '10 Market Street',
    city: 'San Francisco',
    unit: '1',
  },
}
const tenants = Array.from({ length: 1000 }, (_, index) => ({
  Id: tenantId(index),
  FirstName: 'Resident' + index,
  Status: 'Current',
  UnitId: unitId(index),
  OccupancyId: occupancyId,
  PhoneNumbers: [{ Number: '4155550100' }],
}))
const units = Array.from({ length: 1000 }, (_, index) => ({
  Id: unitId(index),
  Address1: `${10 + index} Market Street #1`,
  City: 'San Francisco',
}))

beforeAll(async () => {
  pg = new PGlite()
  state.db = drizzle({ client: pg })
  for (const dir of (await readdir('drizzle')).sort())
    if (!dir.startsWith('.'))
      await pg.exec(await readFile(`drizzle/${dir}/migration.sql`, 'utf8'))
}, 30000)
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('CREDENTIAL_KEYS', JSON.stringify({ v1: 'a'.repeat(64) }))
  vi.stubEnv('CREDENTIAL_KEY_ID', 'v1')
  vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')
  vi.stubEnv('TENANT_VALIDATION_CACHE_TTL_SECONDS', '43200')
  await pg.exec('truncate appfolio_grant,appfolio_connection cascade')
  const id = 'validation-connection-' + crypto.randomUUID()
  await pg.query(
    'insert into appfolio_connection (id,user_id,name,credentials) values ($1,$2,$3,$4)',
    [id, identity.userId, 'Validation', 'never-decrypted-on-cache-hit'],
  )
  await pg.query(
    'insert into appfolio_grant (id,user_id,session_id,connection_id,client_id,client_name,request_hash,approved_at) values ($1,$2,$3,$4,$5,$6,$7,now())',
    [
      identity.grantId,
      identity.userId,
      'validation-session',
      id,
      identity.clientId,
      'Validation client',
      crypto.randomUUID(),
    ],
  )
  vi.mocked(runOperation)
    .mockReset()
    .mockImplementation(async (op, raw) => {
      const query = z
        .object({
          query: z.object({ filters: z.record(z.string(), z.unknown()) }),
        })
        .parse(raw).query
      const ids =
        typeof query.filters.Id === 'string' ? query.filters.Id.split(',') : []
      return {
        status: 200,
        data: {
          data:
            op.name === 'getTenants'
              ? tenants
              : units.filter((unit) => ids.includes(unit.Id)),
        },
        metadata: {
          correlationId: identity.correlationId,
          upstreamStatus: 200,
          retryAfter: null,
          idempotentReplayed: false,
          idempotencyKey: undefined,
        },
      }
    })
})
afterEach(() => {
  vi.unstubAllEnvs()
})

const wireResponse = z.object({
  result: z.object({
    isError: z.boolean().optional(),
    structuredContent: z.object({
      status: z.string(),
      tenant: z.object({ occupancyId: z.uuid() }).optional(),
      metadata: z.object({
        cache: z.enum(['hit', 'miss']),
        fetchedAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
      }),
    }),
  }),
})
async function protocolCall(input: unknown = evidence) {
  const response = await protocolHandler(identity).fetch(
    new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-11-25',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'validate_tenant', arguments: input },
      }),
    }),
  )
  expect(response.status).toBe(200)
  const raw = await response.text()
  const payload: unknown = response.headers
    .get('content-type')
    ?.includes('text/event-stream')
    ? JSON.parse(
        raw
          .split('\n')
          .find((line) => line.startsWith('data:'))
          ?.slice(5) ?? '{}',
      )
    : JSON.parse(raw)
  return wireResponse.parse(payload).result.structuredContent
}

it('loads only the matched unit from a 1000-tenant inventory and makes no upstream calls on cache hits', async () => {
  const first = await protocolCall()
  expect(first.status).toBe('authenticated')
  expect(first.tenant?.occupancyId).toBe(occupancyId)
  expect(first.metadata.cache).toBe('miss')
  expect(
    Date.parse(first.metadata.expiresAt) - Date.parse(first.metadata.fetchedAt),
  ).toBe(43200000)
  expect(runOperation).toHaveBeenCalledTimes(2) // Tenant inventory, then one matching unit.
  expect(vi.mocked(runOperation).mock.calls[1]?.[1]).toEqual({
    query: { filters: { Id: unitId(0) }, page: { number: 1, size: 1000 } },
  })
  vi.mocked(runOperation).mockClear()
  const times = []
  for (let index = 0; index < 20; index++) {
    const started = performance.now()
    const output = await protocolCall()
    times.push(performance.now() - started)
    expect(output.status).toBe('authenticated')
    expect(output.metadata.cache).toBe('hit')
  }
  expect(runOperation).not.toHaveBeenCalled()
  // Local CPU, real SQL authorization, SDK cache, encryption, schemas and MCP transport.
  // This excludes remote Neon/Vercel latency and OAuth bearer verification.
  expect(Math.max(...times)).toBeLessThan(1000)
}, 15000)

it('does not query units when first name or phone fails to match', async () => {
  for (const input of [
    { ...evidence, firstName: 'Unknown' },
    { ...evidence, phoneNumber: '4155559999' },
  ]) {
    const result = await protocolCall(input)
    expect(result.status).toBe('not_authenticated')
  }
  expect(runOperation).toHaveBeenCalledTimes(1)
  expect(vi.mocked(runOperation).mock.calls[0]?.[0].name).toBe('getTenants')
})

it('requires the Address2 apartment through MCP on a cache miss and validates it on cache hits', async () => {
  const response = {
    status: 200,
    metadata: {
      correlationId: identity.correlationId,
      upstreamStatus: 200,
      retryAfter: null,
      idempotentReplayed: false,
      idempotencyKey: undefined,
    },
  }
  vi.mocked(runOperation)
    .mockResolvedValueOnce({ ...response, data: { data: tenants } })
    .mockResolvedValueOnce({
      ...response,
      data: {
        data: [
          {
            Id: unitId(0),
            Address1: '10 Market Street',
            Address2: 'Apt 1',
            City: 'San Francisco',
          },
        ],
      },
    })
  const missingUnit = await protocolCall({
    ...evidence,
    address: { streetAddress: '10 Market Street', city: 'San Francisco' },
  })
  expect(missingUnit.status).toBe('needs_review')
  expect(missingUnit.metadata.cache).toBe('miss')
  expect(runOperation).toHaveBeenCalledTimes(2)
  vi.mocked(runOperation).mockClear()

  const correct = await protocolCall()
  expect(correct.status).toBe('authenticated')
  expect(correct.tenant?.occupancyId).toBe(occupancyId)
  expect(correct.metadata.cache).toBe('hit')
  const wrong = await protocolCall({
    ...evidence,
    address: { ...evidence.address, unit: '2' },
  })
  expect(wrong.status).toBe('not_authenticated')
  expect(runOperation).not.toHaveBeenCalled()
})

it('fetches a different matched unit lazily without downloading the tenant inventory again', async () => {
  await protocolCall()
  vi.mocked(runOperation).mockClear()
  const input = {
    ...evidence,
    firstName: 'Resident1',
    address: { ...evidence.address, streetAddress: '11 Market Street' },
  }
  expect((await protocolCall(input)).status).toBe('authenticated')
  expect(runOperation).toHaveBeenCalledTimes(1)
  expect(vi.mocked(runOperation).mock.calls[0]?.[0].name).toBe('getUnits')
  expect(vi.mocked(runOperation).mock.calls[0]?.[1]).toEqual({
    query: { filters: { Id: unitId(1) }, page: { number: 1, size: 1000 } },
  })
  vi.mocked(runOperation).mockClear()
  expect((await protocolCall(input)).metadata.cache).toBe('hit')
  expect((await protocolCall()).metadata.cache).toBe('hit')
  expect(runOperation).not.toHaveBeenCalled()
})

it('keeps a failed unit lookup isolated from another tenant and the cached tenant inventory', async () => {
  await protocolCall()
  vi.mocked(runOperation)
    .mockClear()
    .mockRejectedValue(new Error('One unit is temporarily unavailable'))
  const input = {
    ...evidence,
    firstName: 'Resident1',
    address: { ...evidence.address, streetAddress: '11 Market Street' },
  }
  expect((await validateTenant(input, identity)).structuredContent.status).toBe(
    'service_unavailable',
  )
  expect(runOperation).toHaveBeenCalledTimes(1)
  expect(vi.mocked(runOperation).mock.calls[0]?.[0].name).toBe('getUnits')
  vi.mocked(runOperation).mockClear()
  expect((await protocolCall()).status).toBe('authenticated')
  expect(runOperation).not.toHaveBeenCalled()
})

it('rejects a removed authorization even when its complete snapshot remains cached', async () => {
  expect(
    (await validateTenant(evidence, identity)).structuredContent.status,
  ).toBe('authenticated')
  vi.mocked(runOperation).mockClear()
  await pg.query('update appfolio_grant set revoked_at=now() where id=$1', [
    identity.grantId,
  ])
  const result = await validateTenant(evidence, identity)
  expect(result.structuredContent.status).toBe('service_unavailable')
  expect(result.structuredContent).not.toHaveProperty('tenant')
  expect(result.structuredContent).not.toHaveProperty('unit')
  expect(runOperation).not.toHaveBeenCalled()
})

it('returns sanitized unavailable output when a snapshot load fails', async () => {
  vi.mocked(runOperation).mockRejectedValue(
    new Error('private-upstream-error-with-tenant-information'),
  )
  const result = await validateTenant(evidence, identity)
  expect(result.isError).toBe(true)
  expect(result.structuredContent.status).toBe('service_unavailable')
  expect(JSON.stringify(result)).not.toContain('private-upstream-error')
})

it('rejects invalid identity evidence before downloading any inventory', async () => {
  const result = await validateTenant(
    { ...evidence, phoneNumber: '' },
    identity,
  )
  expect(result.structuredContent.status).toBe('needs_more_information')
  expect(runOperation).not.toHaveBeenCalled()
})
