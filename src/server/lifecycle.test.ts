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
import { catalog } from '@/appfolio/contract'
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
  for (const op of catalog.operations) {
    const raw = fixture(op.inputSchema) as {
      query?: Record<string, unknown>
      idempotencyKey?: string
    }
    if (op.name === 'getWorkOrders')
      raw.query = { filters: { LastUpdatedAtFrom: '2026-01-01T00:00:00Z' } }
    if (op.name === 'getjobs') continue // requires a recorded JobId; covered separately.
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
