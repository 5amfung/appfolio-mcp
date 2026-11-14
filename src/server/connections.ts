import { randomUUID } from 'node:crypto'
import { and, eq, isNull, or, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/index.server'
import { connections, grants } from '@/db/schema'
import { encrypt, decrypt } from './crypto'
import { AppError } from './errors'
import { ownedConnection } from './grants'
import { log } from './logging'
import { boundedResponse } from '@/appfolio/request'

const credentialValue = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (v) =>
      !v.includes('\r') &&
      !v.includes('\n') &&
      !v.includes(String.fromCharCode(0)),
  )
export const credentialsSchema = z.object({
  clientId: credentialValue,
  clientSecret: credentialValue,
  databaseId: credentialValue,
  developerId: credentialValue,
})
export const connectionInput = z.object({
  name: z.string().trim().min(1).max(100),
  ...credentialsSchema.shape,
})
export const connectionUpdate = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  clientId: credentialValue.optional(),
  clientSecret: credentialValue.optional(),
  databaseId: credentialValue.optional(),
  developerId: credentialValue.optional(),
})
export type Credentials = z.infer<typeof credentialsSchema>
const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().regex(/^bearer$/i),
  expires_in: z.number().positive().max(86400),
})
export function readCredentials(c: typeof connections.$inferSelect) {
  return credentialsSchema.parse(
    JSON.parse(decrypt(c.credentials, `${c.id}:credentials`)),
  )
}
async function requestToken(credentials: Credentials) {
  let response: Response
  const started = Date.now()
  try {
    response = await fetch('https://api.appfolio.com/oauth/token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
    })
  } catch {
    throw new AppError('appfolio_token_unavailable', 502)
  }
  if (!response.ok) throw new AppError('appfolio_credentials_rejected', 400)
  const raw = await boundedResponse(response, 32_768)
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new AppError('appfolio_invalid_token_response', 502)
  }
  const parsed = tokenSchema.safeParse(value)
  if (!parsed.success)
    throw new AppError('appfolio_invalid_token_response', 502)
  const expiresAt = new Date(started + parsed.data.expires_in * 1000)
  if (expiresAt.getTime() <= Date.now() + 5000)
    throw new AppError('appfolio_invalid_token_expiration', 502)
  return { token: parsed.data.access_token, expiresAt }
}
export async function acquireToken(
  credentials: Credentials,
  correlationId: string = crypto.randomUUID(),
) {
  const started = Date.now()
  try {
    const result = await requestToken(credentials)
    log({
      operation: 'appfolio.token_acquisition',
      outcome: 'success',
      correlation_id: correlationId,
      duration_ms: Date.now() - started,
    })
    return result
  } catch (error) {
    log({
      operation: 'appfolio.token_acquisition',
      outcome: 'failure',
      correlation_id: correlationId,
      duration_ms: Date.now() - started,
      severity: 'warn',
      error_category:
        error instanceof AppError
          ? error.category
          : 'appfolio_invalid_token_response',
    })
    throw error
  }
}
async function validateCredentials(credentials: Credentials) {
  const token = await acquireToken(credentials)
  let response: Response
  try {
    const query = new URLSearchParams({
      'filters[LastUpdatedAtFrom]': new Date().toISOString(),
      'page[size]': '1',
    })
    response = await fetch(
      `https://api.appfolio.com/api/v0/work_orders?${query}`,
      {
        headers: {
          Authorization: `Bearer ${token.token}`,
          'X-AppFolio-Database-ID': credentials.databaseId,
          'X-AppFolio-Developer-ID': credentials.developerId,
        },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      },
    )
    await response.body?.cancel()
  } catch {
    throw new AppError('appfolio_connection_validation_unavailable', 502)
  }
  if (!response.ok)
    throw new AppError(
      'appfolio_connection_validation_failed_work_order_read_required',
    )
  return token
}
export async function saveConnection(
  userId: string,
  input: z.infer<typeof connectionInput>,
) {
  const id = randomUUID()
  const validated = await validateCredentials(input)
  const [c] = await getDb()
    .insert(connections)
    .values({
      id,
      userId,
      name: input.name,
      identifierHint: `Database ••••${input.databaseId.slice(-4)} · Client ••••${input.clientId.slice(-4)}`,
      credentials: encrypt(
        JSON.stringify(credentialsSchema.parse(input)),
        `${id}:credentials`,
      ),
      token: encrypt(validated.token, `${id}:token`),
      expiresAt: validated.expiresAt,
    })
    .returning()
  return c.id
}
export async function updateConnection(
  userId: string,
  input: z.infer<typeof connectionUpdate>,
) {
  const old = await ownedConnection(userId, input.id)
  const credentials = readCredentials(old)
  const candidate = credentialsSchema.parse({
    ...credentials,
    ...Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    ),
  })
  const changed = Object.keys(credentials).some(
    (k) => Reflect.get(credentials, k) !== Reflect.get(candidate, k),
  )
  const identityChanged =
    credentials.clientId !== candidate.clientId ||
    credentials.databaseId !== candidate.databaseId ||
    credentials.developerId !== candidate.developerId
  if (changed) await validateCredentials(candidate)
  await getDb().transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, old.id),
          eq(connections.userId, userId),
          isNull(connections.deletedAt),
        ),
      )
      .for('update')
    if (!locked || locked.version !== old.version)
      throw new AppError('connection_changed_reload', 409)
    await tx
      .update(connections)
      .set({
        name: input.name ?? old.name,
        ...(changed
          ? {
              credentials: encrypt(
                JSON.stringify(candidate),
                `${old.id}:credentials`,
              ),
              version: old.version + 1,
              identifierHint: `Database ••••${candidate.databaseId.slice(-4)} · Client ••••${candidate.clientId.slice(-4)}`,
              token: null,
              expiresAt: null,
              leaseId: null,
              leaseUntil: null,
            }
          : {}),
      })
      .where(eq(connections.id, old.id))
    if (identityChanged) {
      await tx
        .update(grants)
        .set({ revokedAt: new Date() })
        .where(eq(grants.connectionId, old.id))
      await tx.execute(
        sql`update "oauthRefreshToken" set revoked=now() where "referenceId" in (select id from appfolio_grant where connection_id=${old.id})`,
      )
    }
  })
}
export async function deleteConnection(userId: string, id: string) {
  await getDb().transaction(async (tx) => {
    const [c] = await tx
      .update(connections)
      .set({
        deletedAt: new Date(),
        credentials: '',
        token: null,
        expiresAt: null,
        leaseId: null,
        leaseUntil: null,
      })
      .where(
        and(
          eq(connections.id, id),
          eq(connections.userId, userId),
          isNull(connections.deletedAt),
        ),
      )
      .returning()
    if (!c) throw new AppError('connection_unavailable', 404)
    await tx
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.connectionId, id))
    await tx.execute(
      sql`update "oauthRefreshToken" set revoked=now() where "referenceId" in (select id from appfolio_grant where connection_id=${id})`,
    )
  })
}
export async function connectionToken(
  userId: string,
  id: string,
  correlationId: string = crypto.randomUUID(),
) {
  const db = getDb()
  for (let attempt = 0; attempt < 12; attempt++) {
    const c = await ownedConnection(userId, id)
    if (c.token && c.expiresAt && c.expiresAt.getTime() > Date.now() + 30_000)
      return { connection: c, token: decrypt(c.token, `${id}:token`) }
    const leaseId = randomUUID()
    const [locked] = await db
      .update(connections)
      .set({ leaseId, leaseUntil: new Date(Date.now() + 15_000) })
      .where(
        and(
          eq(connections.id, id),
          eq(connections.version, c.version),
          isNull(connections.deletedAt),
          or(
            isNull(connections.leaseUntil),
            lt(connections.leaseUntil, new Date()),
          ),
        ),
      )
      .returning()
    if (!locked) {
      await new Promise((resolve) => setTimeout(resolve, 100 + attempt * 30))
      continue
    }
    try {
      // Reread after acquiring shared coordination. Credential version fences stale results.
      const current = await ownedConnection(userId, id)
      if (current.version !== locked.version) continue
      if (
        current.token &&
        current.expiresAt &&
        current.expiresAt.getTime() > Date.now() + 30_000
      )
        return {
          connection: current,
          token: decrypt(current.token, `${id}:token`),
        }
      const token = await acquireToken(readCredentials(current), correlationId)
      const [saved] = await db
        .update(connections)
        .set({
          token: encrypt(token.token, `${id}:token`),
          expiresAt: token.expiresAt,
          leaseId: null,
          leaseUntil: null,
        })
        .where(
          and(
            eq(connections.id, id),
            eq(connections.version, current.version),
            eq(connections.leaseId, leaseId),
            isNull(connections.deletedAt),
          ),
        )
        .returning()
      if (!saved) throw new AppError('connection_changed_reload', 409)
      return { connection: saved, token: token.token }
    } finally {
      await db
        .update(connections)
        .set({ leaseId: null, leaseUntil: null })
        .where(and(eq(connections.id, id), eq(connections.leaseId, leaseId)))
    }
  }
  throw new AppError('appfolio_token_busy_retry', 503)
}
