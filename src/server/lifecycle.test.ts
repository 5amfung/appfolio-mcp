// @vitest-environment node
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  expect,
  vi,
} from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { connections, grants } from '@/db/schema'

const state = vi.hoisted(() => ({
  db: undefined as ReturnType<typeof drizzle> | undefined,
}))
vi.mock('@/db/index.server', () => ({ getDb: () => state.db }))
import {
  saveConnection,
  updateConnection,
  deleteConnection,
  connectionToken,
} from './connections'
import {
  activeGrant,
  selectConnection,
  revokeGrant,
  requestHash,
} from './grants'
import { catalog, ajv, outputContract } from '@/appfolio/contract'
import { execute } from '@/appfolio/execute'
import { fixture } from '@/test/contract-fixture'

let pg: PGlite
const credentials = {
  clientId: 'client',
  clientSecret: 'never-log-this',
  databaseId: 'db',
  developerId: 'dev',
}
function tokenResponse() {
  return Response.json({
    access_token: 'upstream-' + crypto.randomUUID(),
    token_type: 'Bearer',
    expires_in: 300,
  })
}
beforeAll(async () => {
  pg = new PGlite()
  state.db = drizzle({ client: pg })
  for (const dir of (await readdir('drizzle')).sort())
    if (!dir.startsWith('.'))
      await pg.exec(await readFile(`drizzle/${dir}/migration.sql`, 'utf8'))
  await pg.exec(
    'create table "oauthRefreshToken" ("referenceId" text, "userId" text, revoked timestamptz); create table "oauthAccessToken" ("referenceId" text, "userId" text, revoked timestamptz)',
  )
}, 30_000)
beforeEach(async () => {
  vi.stubEnv('CREDENTIAL_KEYS', JSON.stringify({ v1: 'a'.repeat(64) }))
  vi.stubEnv('CREDENTIAL_KEY_ID', 'v1')
  vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => tokenResponse()),
  )
  await pg.exec(
    'truncate appfolio_retry,appfolio_job,appfolio_grant,appfolio_connection cascade',
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
afterAll(async () => {
  await pg.close()
})
async function setup() {
  const connection = await saveConnection('user-a', {
    ...credentials,
    name: 'A',
  })
  const grant = await selectConnection({
    userId: 'user-a',
    sessionId: 'session',
    connectionId: connection,
    clientId: 'agent',
    clientName: 'Agent',
    hash: crypto.randomUUID(),
  })
  await state
    .db!.update(grants)
    .set({ approvedAt: new Date() })
    .where(eq(grants.id, grant.id))
  return { connection, grant }
}
it('keeps identical credential copies independent and encrypted', async () => {
  const a = await saveConnection('user-a', { ...credentials, name: 'A' }),
    b = await saveConnection('user-b', { ...credentials, name: 'B' })
  const rows = await state.db!.select().from(connections)
  expect(rows).toHaveLength(2)
  expect(rows[0].credentials).not.toContain(credentials.clientSecret)
  const ta = await connectionToken('user-a', a),
    tb = await connectionToken('user-b', b)
  expect(ta.token).not.toBe(tb.token)
  await expect(connectionToken('user-b', a)).rejects.toThrow(
    'connection_unavailable',
  )
})
it('parallel selections for the same agent preserve immutable separate bindings', async () => {
  const a = await saveConnection('user-a', { ...credentials, name: 'A' }),
    b = await saveConnection('user-a', { ...credentials, name: 'B' })
  const first = await selectConnection({
    userId: 'user-a',
    sessionId: 's',
    connectionId: a,
    clientId: 'agent',
    clientName: 'Agent',
    hash: 'flow-a',
  })
  const second = await selectConnection({
    userId: 'user-a',
    sessionId: 's',
    connectionId: b,
    clientId: 'agent',
    clientName: 'Agent',
    hash: 'flow-b',
  })
  expect(first.id).not.toBe(second.id)
  await expect(
    selectConnection({
      userId: 'user-a',
      sessionId: 's',
      connectionId: b,
      clientId: 'agent',
      clientName: 'Agent',
      hash: 'flow-a',
    }),
  ).rejects.toThrow('selection_already_bound')
  await expect(
    selectConnection({
      userId: 'user-b',
      sessionId: 's',
      connectionId: a,
      clientId: 'agent',
      clientName: 'Agent',
      hash: 'flow-c',
    }),
  ).rejects.toThrow('connection_unavailable')
})
it('rename and secret-only replacement preserve grants while identity changes revoke them', async () => {
  const { connection, grant } = await setup()
  await updateConnection('user-a', { id: connection, name: 'Renamed' })
  expect((await activeGrant(grant.id, 'user-a')).connection.version).toBe(1)
  await updateConnection('user-a', {
    id: connection,
    clientSecret: 'replacement',
  })
  expect((await activeGrant(grant.id, 'user-a')).connection.version).toBe(2)
  await updateConnection('user-a', { id: connection, databaseId: 'new-db' })
  await expect(activeGrant(grant.id, 'user-a')).rejects.toThrow(
    'authorization_removed',
  )
})
it('invalid candidate credentials preserve saved credentials and token state', async () => {
  const { connection, grant } = await setup()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ error: 'invalid_client' }, { status: 401 }),
    ),
  )
  await expect(
    updateConnection('user-a', { id: connection, clientSecret: 'bad' }),
  ).rejects.toThrow('credentials_rejected')
  const current = await activeGrant(grant.id, 'user-a')
  expect(current.connection.version).toBe(1)
  expect(current.connection.token).toBeTruthy()
})
it('removal affects only its grant and recreation cannot revive it', async () => {
  const { connection, grant } = await setup()
  const other = await selectConnection({
    userId: 'user-a',
    sessionId: 's',
    connectionId: connection,
    clientId: 'agent',
    clientName: 'Agent',
    hash: 'other',
  })
  await state
    .db!.update(grants)
    .set({ approvedAt: new Date() })
    .where(eq(grants.id, other.id))
  await revokeGrant('user-a', grant.id)
  await expect(activeGrant(grant.id, 'user-a')).rejects.toThrow(
    'authorization_removed',
  )
  expect((await activeGrant(other.id, 'user-a')).connection.id).toBe(connection)
  await deleteConnection('user-a', connection)
  const fresh = await saveConnection('user-a', { ...credentials, name: 'A' })
  expect(fresh).not.toBe(connection)
  await expect(activeGrant(other.id, 'user-a')).rejects.toThrow(
    'authorization_removed',
  )
})
it('stale token acquisition cannot overwrite a replacement or recreate a deleted connection', async () => {
  const { connection } = await setup()
  await state
    .db!.update(connections)
    .set({ token: null, expiresAt: null })
    .where(eq(connections.id, connection))
  let release: (response: Response) => void = () => {}
  let started: () => void = () => {}
  const entered = new Promise<void>((resolve) => {
    started = resolve
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
          started()
        }),
    ),
  )
  const pending = connectionToken('user-a', connection)
  const assertion = expect(pending).rejects.toThrow('connection_changed')
  await entered
  await deleteConnection('user-a', connection)
  release(tokenResponse())
  await assertion
  const [c] = await state
    .db!.select()
    .from(connections)
    .where(eq(connections.id, connection))
  expect(c.deletedAt).toBeTruthy()
  expect(c.token).toBeNull()
  expect(c.credentials).toBe('')
})

it('executes every operation through binding/authentication with success and upstream-error fixtures', async () => {
  const { grant } = await setup()
  const identity = {
    userId: 'user-a',
    grantId: grant.id,
    clientId: 'agent',
    correlationId: 'fixture',
  }
  for (const op of catalog.operations.filter(
    (operation) => operation.name !== 'getjobs',
  )) {
    const raw = fixture(op.inputSchema) as {
      query?: Record<string, unknown>
      idempotencyKey?: string
    }
    if (op.name === 'getWorkOrders')
      raw.query = { filters: { LastUpdatedAtFrom: '2026-01-01T00:00:00Z' } }
    const status = Object.keys(op.responses)
      .map(Number)
      .find((n) => n >= 200 && n < 300)!
    const body = op.path.endsWith('/async')
      ? { JobId: '11111111-1111-4111-8111-111111111111' }
      : fixture(op.responses[String(status)])
    const spy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toMatch(/^Bearer upstream-/)
      expect(headers.get('X-AppFolio-Database-ID')).toBe(credentials.databaseId)
      expect(headers.get('X-AppFolio-Developer-ID')).toBe(
        credentials.developerId,
      )
      expect(init?.method).toBe(op.method)
      return status === 204
        ? new Response(null, { status })
        : Response.json(body, { status })
    })
    vi.stubGlobal('fetch', spy)
    const result = await execute(op, raw, identity)
    expect(
      result.isError,
      op.name + ': ' + JSON.stringify(result.content),
    ).toBe(false)
    expect(spy).toHaveBeenCalledOnce()
    const badStatus = Object.keys(op.responses)
      .map(Number)
      .find((n) => n >= 400 && n < 500)
    if (badStatus) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json(fixture(op.responses[String(badStatus)]), {
            status: badStatus,
          }),
        ),
      )
      expect(
        (await execute(op, raw, identity)).isError,
        op.name + ' upstream error',
      ).toBe(true)
    }
  }
}, 120_000)

it.each(['json', 'html', 'empty', 'unreadable'])(
  'preserves a real 429 %s response and the work-order retry identity',
  async (bodyKind) => {
    const { grant } = await setup()
    const identity = {
      userId: 'user-a',
      grantId: grant.id,
      clientId: 'agent',
      correlationId: 'rate-limit-fixture',
    }
    const op = catalog.operations.find(
      (item) => item.name === 'createWorkOrder',
    )!
    const input = {
      body: {
        JobDescription: 'Repair the faucet.',
        OccupancyId: '11111111-1111-4111-8111-111111111111',
        Priority: 'Normal',
        PermissionToEnter: false,
        Status: 'New',
        Type: 'Internal',
      },
      idempotencyKey: 'rate-limited-request',
    }
    const requests: { body: RequestInit['body']; key: string | null }[] = []
    const headers = { 'Retry-After': '30' }
    const limited =
      bodyKind === 'json'
        ? Response.json(
            { code: 429, message: 'Private upstream diagnostic' },
            { status: 429, headers },
          )
        : new Response(
            bodyKind === 'html'
              ? '<html>Rate limited</html>'
              : bodyKind === 'unreadable'
                ? new ReadableStream({
                    start(controller) {
                      controller.error(new Error('Body stream failed'))
                    },
                  })
                : null,
            { status: 429, headers },
          )
    const upstream = vi.fn(async (_url: unknown, init?: RequestInit) => {
      requests.push({
        body: init?.body,
        key: new Headers(init?.headers).get('Idempotency-Key'),
      })
      return requests.length === 1
        ? limited
        : Response.json(
            { Id: '22222222-2222-4222-8222-222222222222' },
            { status: 201 },
          )
    })
    vi.stubGlobal('fetch', upstream)
    const result = await execute(op, input, identity)
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      status: 429,
      data: { code: 429, message: 'AppFolio rate limit exceeded.' },
      metadata: {
        retryAfter: '30',
        idempotencyKey: input.idempotencyKey,
        upstreamStatus: 429,
        correlationId: identity.correlationId,
      },
    })
    expect(JSON.stringify(result)).not.toContain('Private upstream diagnostic')
    expect(upstream).toHaveBeenCalledOnce()
    expect((await execute(op, input, identity)).structuredContent?.status).toBe(
      201,
    )
    expect(requests).toHaveLength(2)
    expect(requests[0].key).toBeTruthy()
    expect(requests[0]).toEqual(requests[1])
    expect(Buffer.from(requests[0].body as Uint8Array).toString('utf8')).toBe(
      JSON.stringify(input.body),
    )
  },
)

it.each([
  'getTenants',
  'createWorkOrder',
  'updateWorkOrder',
  'putUnitPricingMatrix',
  'deleteWorkOrderAttachment',
])(
  'exposes schema-valid global rate limits for %s even without an endpoint 429 schema',
  async (name) => {
    const { grant } = await setup()
    const identity = {
      userId: 'user-a',
      grantId: grant.id,
      clientId: 'agent',
      correlationId: 'rate-limit-envelope',
    }
    const op = catalog.operations.find((item) => item.name === name)!
    expect(op.responses['429']).toBeUndefined()
    expect(op.responses.default).toBeUndefined()
    const mutation = ['POST', 'PATCH', 'PUT'].includes(op.method)
    const input = fixture(op.inputSchema) as { idempotencyKey?: string }
    if (mutation) input.idempotencyKey = 'rate-limited-write'
    const retryAfter = 'Sun, 15 Nov 2026 23:59:00 GMT'
    const upstream = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.method).toBe(op.method)
      const headers = new Headers(init?.headers)
      expect(headers.has('Idempotency-Key')).toBe(mutation)
      return new Response(null, {
        status: 429,
        headers: { 'Retry-After': retryAfter },
      })
    })
    vi.stubGlobal('fetch', upstream)
    const result = await execute(op, input, identity)
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      status: 429,
      data: { code: 429, message: 'AppFolio rate limit exceeded.' },
      metadata: {
        upstreamStatus: 429,
        retryAfter,
        correlationId: identity.correlationId,
      },
    })
    const validate = ajv.compile(outputContract(op))
    expect(result.structuredContent?.metadata.idempotencyKey).toBe(
      input.idempotencyKey,
    )
    expect(
      validate(result.structuredContent),
      JSON.stringify(validate.errors),
    ).toBe(true)
    expect(upstream).toHaveBeenCalledOnce()
  },
)

it.each(['createWorkOrder', 'updateWorkOrder', 'putUnitPricingMatrix'])(
  'returns the direct %s error and retry key when the write outcome is unknown',
  async (name) => {
    const { grant } = await setup()
    const identity = {
      userId: 'user-a',
      grantId: grant.id,
      clientId: 'agent',
      correlationId: 'uncertain-creation',
    }
    const op = catalog.operations.find((item) => item.name === name)!
    const input = {
      ...(fixture(op.inputSchema) as Record<string, unknown>),
      idempotencyKey: 'uncertain-work-order',
    }
    const upstream = vi.fn(async () => {
      throw new Error('Connection interrupted')
    })
    vi.stubGlobal('fetch', upstream)
    const result = await execute(op, input, identity)
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      error: 'write_outcome_unknown_confirm_upstream_before_retry',
      status: 502,
      idempotencyKey: input.idempotencyKey,
      correlationId: identity.correlationId,
    })
    expect(upstream).toHaveBeenCalledOnce()
  },
)

it('persists exact multipart and JSON bytes and keys across repeated calls', async () => {
  const { grant } = await setup()
  const identity = {
    userId: 'user-a',
    grantId: grant.id,
    clientId: 'agent',
    correlationId: 'retry-fixture',
  }
  for (const name of [
    'createInventoryLocation',
    catalog.operations.find((o) => o.mediaType === 'multipart/form-data')!.name,
  ]) {
    const op = catalog.operations.find((o) => o.name === name)!
    const input = fixture(op.inputSchema) as {
      body?: unknown
      idempotencyKey?: string
    }
    input.idempotencyKey = crypto.randomUUID()
    if (op.mediaType === 'multipart/form-data')
      input.body = {
        File: {
          filename: 'proof.txt',
          mediaType: 'text/plain',
          base64: 'aGVsbG8=',
        },
      }
    const requests: {
      bytes: Uint8Array
      contentType: string | null
      key: string | null
    }[] = []
    const status = Object.keys(op.responses)
      .map(Number)
      .find((n) => n >= 200 && n < 300)!
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        requests.push({
          bytes: new Uint8Array(init?.body as Uint8Array),
          contentType: headers.get('Content-Type'),
          key: headers.get('Idempotency-Key'),
        })
        return Response.json(fixture(op.responses[String(status)]), { status })
      }),
    )
    expect((await execute(op, input, identity)).isError).toBe(false)
    expect((await execute(op, input, identity)).isError).toBe(false)
    expect(requests[0]).toEqual(requests[1])
    expect(
      (await execute(op, { ...input, body: { Name: 'different' } }, identity))
        .isError,
    ).toBe(true)
    expect(requests).toHaveLength(2)
  }
})

it('binds asynchronous job retrieval to its grant and bounds polling', async () => {
  const { connection, grant } = await setup()
  const identity = {
    userId: 'user-a',
    grantId: grant.id,
    clientId: 'agent',
    correlationId: 'jobs-fixture',
  }
  const op = catalog.operations.find((o) => o.name === 'bulkCreateBillAsync')!
  const jobId = '11111111-1111-4111-8111-111111111111'
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ JobId: jobId }, { status: 202 })),
  )
  expect((await execute(op, fixture(op.inputSchema), identity)).isError).toBe(
    false,
  )
  const get = catalog.operations.find((o) => o.name === 'getjobs')!
  const input = { query: { filters: { Id: jobId } } }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        data: [{ Id: jobId, Status: 'finished' }],
        next_page_path: null,
      }),
    ),
  )
  expect((await execute(get, input, identity)).isError).toBe(false)
  expect((await execute(get, input, identity)).isError).toBe(true)
  const other = await selectConnection({
    userId: 'user-a',
    sessionId: 's',
    connectionId: connection,
    clientId: 'agent',
    clientName: 'Agent',
    hash: 'job-other',
  })
  await state
    .db!.update(grants)
    .set({ approvedAt: new Date() })
    .where(eq(grants.id, other.id))
  const spy = vi.fn()
  vi.stubGlobal('fetch', spy)
  expect(
    (await execute(get, input, { ...identity, grantId: other.id })).isError,
  ).toBe(true)
  expect(spy).not.toHaveBeenCalled()
})

it('coordinates concurrent token acquisition through shared database state', async () => {
  const { connection } = await setup()
  await state
    .db!.update(connections)
    .set({ token: null, expiresAt: null })
    .where(eq(connections.id, connection))
  const spy = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    return tokenResponse()
  })
  vi.stubGlobal('fetch', spy)
  const [a, b] = await Promise.all([
    connectionToken('user-a', connection),
    connectionToken('user-a', connection),
  ])
  expect(a.token).toBe(b.token)
  expect(spy).toHaveBeenCalledOnce()
})

it('keeps signed-flow identity stable across provider re-signing without mixing requests', () => {
  const a = 'client_id=a&state=x&code_challenge=first&exp=1&ba_iat=1&sig=a'
  const b =
    'client_id=a&state=x&code_challenge=first&exp=2&ba_iat=2&sig=b&ba_pl=session'
  expect(requestHash(a)).toBe(requestHash(b))
  expect(requestHash(a)).not.toBe(requestHash(b.replace('state=x', 'state=y')))
})

it('scopes caller retry keys by upstream path and returns replay markers', async () => {
  const { grant } = await setup()
  const identity = {
    userId: 'user-a',
    grantId: grant.id,
    clientId: 'agent',
    correlationId: 'path-retry',
  }
  const keys: string[] = []
  for (const name of ['createInventoryLocation', 'createInventory']) {
    const op = catalog.operations.find((o) => o.name === name)!
    const input = fixture(op.inputSchema) as Record<string, unknown>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        keys.push(new Headers(init?.headers).get('Idempotency-Key')!)
        return Response.json(fixture(op.responses['201']), {
          status: 201,
          headers: { 'Idempotent-Replayed': 'true' },
        })
      }),
    )
    const result = await execute(
      op,
      { ...input, idempotencyKey: 'same caller key / 2026' },
      identity,
    )
    expect(result.isError).toBe(false)
    expect(
      'structuredContent' in result &&
        result.structuredContent?.metadata.idempotentReplayed,
    ).toBe(true)
  }
  expect(keys[0]).not.toBe(keys[1])
})

it('accepts valid OAuth connections whose work-order permission is denied', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) =>
      String(url).endsWith('/oauth/token')
        ? tokenResponse()
        : Response.json(
            { code: 403, message: 'Insufficient permissions' },
            { status: 403 },
          ),
    ),
  )
  const id = await saveConnection('user-a', {
    ...credentials,
    name: 'Restricted connection',
  })
  expect((await connectionToken('user-a', id)).token).toMatch(/^upstream-/)
})
