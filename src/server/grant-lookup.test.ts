// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { connections, grants } from '@/db/schema'

const state = vi.hoisted(() => ({
  db: undefined as ReturnType<typeof drizzle> | undefined,
  queries: [] as string[],
}))
vi.mock('@/db/index.server', () => ({ getDb: () => state.db }))
import { activeGrant } from './grants'

let pg: PGlite
beforeAll(async () => {
  pg = new PGlite()
  state.db = drizzle({
    client: pg,
    logger: { logQuery: (query) => state.queries.push(query) },
  })
  await pg.exec(
    await readFile('drizzle/20261115202525_initial/migration.sql', 'utf8'),
  )
}, 30_000)
beforeEach(async () => {
  await pg.exec('truncate appfolio_grant, appfolio_connection cascade')
  state.queries = []
})
afterAll(async () => {
  await pg.close()
})

async function seed(
  options: {
    connectionOwner?: string
    deletedAt?: Date
    approvedAt?: Date | null
    revokedAt?: Date
  } = {},
) {
  if (!state.db) throw new Error('Test database is unavailable')
  await state.db.insert(connections).values({
    id: 'connection-a',
    userId: options.connectionOwner ?? 'user-a',
    name: 'Test connection',
    credentials: 'encrypted-placeholder',
    version: 3,
    deletedAt: options.deletedAt,
  })
  await state.db.insert(grants).values({
    id: 'grant-a',
    userId: 'user-a',
    connectionId: 'connection-a',
    clientId: 'client-a',
    clientName: 'Test client',
    requestHash: 'request-a',
    sessionId: 'session-a',
    approvedAt:
      options.approvedAt === undefined ? new Date() : options.approvedAt,
    revokedAt: options.revokedAt,
  })
  state.queries = []
}

it('loads the active grant and owned connection in one database round trip', async () => {
  await seed()
  const bound = await activeGrant('grant-a', 'user-a')
  expect(bound.grant).toMatchObject({
    id: 'grant-a',
    clientId: 'client-a',
    connectionId: 'connection-a',
  })
  expect(bound.connection).toMatchObject({
    id: 'connection-a',
    userId: 'user-a',
    version: 3,
  })
  expect(state.queries).toHaveLength(1)
})

it('rejects revoked authorization before returning its connection', async () => {
  await seed({ revokedAt: new Date() })
  await expect(activeGrant('grant-a', 'user-a')).rejects.toMatchObject({
    category: 'authorization_removed_reauthorize',
    status: 401,
  })
})

it('rejects unapproved authorization with its existing category', async () => {
  await seed({ approvedAt: null })
  await expect(activeGrant('grant-a', 'user-a')).rejects.toMatchObject({
    category: 'authorization_removed_reauthorize',
    status: 401,
  })
})

it('does not reveal a grant belonging to another user', async () => {
  await seed()
  await expect(activeGrant('grant-a', 'user-b')).rejects.toMatchObject({
    category: 'authorization_removed_reauthorize',
    status: 401,
  })
})

it('rejects an approved grant whose connection was deleted', async () => {
  await seed({ deletedAt: new Date() })
  await expect(activeGrant('grant-a', 'user-a')).rejects.toMatchObject({
    category: 'connection_unavailable',
    status: 404,
  })
})

it('rejects a grant bound to a connection owned by another user', async () => {
  await seed({ connectionOwner: 'user-b' })
  await expect(activeGrant('grant-a', 'user-a')).rejects.toMatchObject({
    category: 'connection_unavailable',
    status: 404,
  })
})

it('preserves authorization error precedence when the connection is also unavailable', async () => {
  await seed({ approvedAt: null, deletedAt: new Date() })
  await expect(activeGrant('grant-a', 'user-a')).rejects.toMatchObject({
    category: 'authorization_removed_reauthorize',
    status: 401,
  })
})

it('rejects an unknown authorization with the existing category', async () => {
  await expect(activeGrant('missing', 'user-a')).rejects.toMatchObject({
    category: 'authorization_removed_reauthorize',
    status: 401,
  })
})
