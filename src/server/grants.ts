import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/index.server'
import { connections, grants } from '@/db/schema'
import { AppError } from './errors'

export const oauthContext = new AsyncLocalStorage<{ requestHash?: string }>()
export function requestHash(query: string) {
  const p = new URLSearchParams(query)
  const original = [...p]
    .filter(([k]) => k !== 'sig' && k !== 'exp' && !k.startsWith('ba_'))
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
  return createHash('sha256')
    .update(new URLSearchParams(original).toString())
    .digest('hex')
}
export async function selectedGrant(userId?: string, sessionId?: string) {
  const hash = oauthContext.getStore()?.requestHash
  if (!hash || !userId || !sessionId) return undefined
  const [g] = await getDb()
    .select()
    .from(grants)
    .where(
      and(
        eq(grants.requestHash, hash),
        eq(grants.userId, userId),
        eq(grants.sessionId, sessionId),
        isNull(grants.revokedAt),
      ),
    )
  if (!g) return undefined
  await ownedConnection(g.userId, g.connectionId)
  return g
}
export async function ownedConnection(userId: string, connectionId: string) {
  const [c] = await getDb()
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.userId, userId),
        isNull(connections.deletedAt),
      ),
    )
  if (!c) throw new AppError('connection_unavailable', 404)
  return c
}
export async function activeGrant(grantId: string, userId: string) {
  const [g] = await getDb()
    .select()
    .from(grants)
    .where(
      and(
        eq(grants.id, grantId),
        eq(grants.userId, userId),
        isNull(grants.revokedAt),
      ),
    )
  if (!g?.approvedAt)
    throw new AppError('authorization_removed_reauthorize', 401)
  const c = await ownedConnection(userId, g.connectionId)
  return { grant: g, connection: c }
}
export const grantClaim = 'https://appfolio-mcp/grant'
export const claimsSchema = z.object({
  sub: z.string(),
  client_id: z.string(),
  [grantClaim]: z.string(),
})
export async function selectConnection(input: {
  userId: string
  sessionId: string
  connectionId: string
  clientId: string
  clientName: string
  hash: string
}) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, input.connectionId),
          eq(connections.userId, input.userId),
          isNull(connections.deletedAt),
        ),
      )
      .for('update')
    if (!c) throw new AppError('connection_unavailable', 404)
    const [created] = await tx
      .insert(grants)
      .values({
        id: randomUUID(),
        userId: input.userId,
        sessionId: input.sessionId,
        connectionId: c.id,
        clientId: input.clientId,
        clientName: input.clientName,
        requestHash: input.hash,
      })
      .onConflictDoNothing()
      .returning()
    if (created) return created
    const [existing] = await tx
      .select()
      .from(grants)
      .where(eq(grants.requestHash, input.hash))
    if (
      !existing ||
      existing.userId !== input.userId ||
      existing.sessionId !== input.sessionId ||
      existing.connectionId !== input.connectionId ||
      existing.revokedAt
    )
      throw new AppError('selection_already_bound')
    return existing
  })
}
export async function revokeGrant(userId: string, id: string) {
  await getDb().transaction(async (tx) => {
    const [g] = await tx
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.id, id), eq(grants.userId, userId)))
      .returning()
    if (!g) throw new AppError('authorization_not_found', 404)
    // Durable tombstone is authoritative even if a concurrent provider request writes later.
    await tx.execute(
      sql`update "oauthRefreshToken" set revoked=now() where "referenceId"=${g.id} and "userId"=${userId}`,
    )
    await tx.execute(
      sql`update "oauthAccessToken" set revoked=now() where "referenceId"=${g.id} and "userId"=${userId}`,
    )
  })
}
