import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider'
import { getDb } from '@/db/index.server'
import { connections, grants } from '@/db/schema'
import { getAuth, appUrl } from './auth'
import { AppError } from './errors'
import {
  connectionInput,
  connectionUpdate,
  saveConnection,
  updateConnection,
  deleteConnection,
} from './connections'
import {
  oauthContext,
  requestHash,
  selectConnection,
  selectedGrant,
  revokeGrant,
  ownedConnection,
} from './grants'
import { log, finishLogs } from './logging'
import { jsonBody, privateJson } from './http'

const actions = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('authorization'),
    oauthQuery: z.string().max(16000),
  }),
  z.object({ action: z.literal('create'), connection: connectionInput }),
  z.object({ action: z.literal('update'), connection: connectionUpdate }),
  z.object({ action: z.literal('delete'), id: z.string().uuid() }),
  z.object({ action: z.literal('revoke'), id: z.string().uuid() }),
  z.object({
    action: z.literal('password'),
    currentPassword: z.string().max(128),
    newPassword: z.string().min(12).max(128),
    confirmation: z.string().max(128),
  }),
  z.object({
    action: z.literal('select'),
    connectionId: z.string().uuid(),
    oauthQuery: z.string().max(16000),
  }),
  z.object({
    action: z.literal('consent'),
    accept: z.boolean(),
    oauthQuery: z.string().max(16000),
  }),
])
export async function verifiedQuery(query: string) {
  if (!(await verifyOAuthQueryParams(query, (await getAuth().$context).secret)))
    throw new AppError('invalid_or_expired_authorization')
  return new URLSearchParams(query)
}
export async function accountApi(request: Request) {
  const correlationId = randomUUID(),
    started = Date.now()
  let operation = 'account'
  try {
    const auth = getAuth()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new AppError('sign_in_required', 401)
    const userId = session.user.id
    if (request.method === 'GET') {
      const rows = await getDb()
        .select()
        .from(connections)
        .where(
          and(eq(connections.userId, userId), isNull(connections.deletedAt)),
        )
      const authorized = await getDb()
        .select({
          id: grants.id,
          clientName: grants.clientName,
          connectionName: connections.name,
          createdAt: grants.approvedAt,
          revokedAt: grants.revokedAt,
        })
        .from(grants)
        .innerJoin(connections, eq(grants.connectionId, connections.id))
        .where(and(eq(grants.userId, userId), isNull(grants.revokedAt)))
      return privateJson({
        user: { name: session.user.name, email: session.user.email },
        connections: rows.map((c) => {
          return {
            id: c.id,
            name: c.name,
            createdAt: c.createdAt,
            expiresAt: c.expiresAt,
            credentialsSaved: true,
            identifierHint: c.identifierHint,
          }
        }),
        grants: authorized.filter((g) => g.createdAt),
      })
    }
    if (request.headers.get('origin') !== appUrl())
      throw new AppError('invalid_origin', 403)
    const input = actions.parse(await jsonBody(request))
    operation = `account.${input.action}`
    let result: unknown = { ok: true }
    switch (input.action) {
      case 'authorization': {
        const q = await verifiedQuery(input.oauthQuery)
        const clientId = q.get('client_id')
        if (!clientId) throw new AppError('client_required')
        const client = await auth.api.getOAuthClientPublic({
          query: { client_id: clientId },
          headers: request.headers,
        })
        const g = await oauthContext.run(
          { requestHash: requestHash(input.oauthQuery) },
          () => selectedGrant(userId, session.session.id),
        )
        const c = g ? await ownedConnection(userId, g.connectionId) : undefined
        result = {
          clientName: client.client_name ?? clientId,
          redirectHost: new URL(q.get('redirect_uri') ?? '').host,
          scopes: q.get('scope') ?? '',
          connectionName: c?.name ?? null,
        }
        break
      }
      case 'create':
        result = { id: await saveConnection(userId, input.connection) }
        break
      case 'update':
        await updateConnection(userId, input.connection)
        break
      case 'delete':
        await deleteConnection(userId, input.id)
        break
      case 'revoke':
        await revokeGrant(userId, input.id)
        break
      case 'password': {
        if (input.newPassword !== input.confirmation)
          throw new AppError('password_confirmation_mismatch')
        // Let Better Auth set replacement session cookies on the actual HTTP response.
        const changed = await auth.api.changePassword({
          headers: request.headers,
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
            revokeOtherSessions: true,
          },
          asResponse: true,
        })
        log({
          operation,
          outcome: changed.ok ? 'success' : 'failure',
          correlation_id: correlationId,
          duration_ms: Date.now() - started,
        })
        return changed
      }
      case 'select': {
        const q = await verifiedQuery(input.oauthQuery)
        const clientId = q.get('client_id')
        if (!clientId) throw new AppError('client_required')
        const client = await auth.api.getOAuthClientPublic({
          query: { client_id: clientId },
          headers: request.headers,
        })
        await selectConnection({
          userId,
          sessionId: session.session.id,
          connectionId: input.connectionId,
          clientId,
          clientName: client.client_name ?? clientId,
          hash: requestHash(input.oauthQuery),
        })
        result = await oauthContext.run(
          { requestHash: requestHash(input.oauthQuery) },
          () =>
            auth.api.oauth2Continue({
              body: { postLogin: true, oauth_query: input.oauthQuery },
              headers: request.headers,
            }),
        )
        break
      }
      case 'consent': {
        await verifiedQuery(input.oauthQuery)
        result = await oauthContext.run(
          { requestHash: requestHash(input.oauthQuery) },
          async () => {
            const g = await selectedGrant(userId, session.session.id)
            if (!g) throw new AppError('select_connection_required')
            await getDb().transaction(async (tx) => {
              const [c] = await tx
                .select()
                .from(connections)
                .where(
                  and(
                    eq(connections.id, g.connectionId),
                    eq(connections.userId, userId),
                    isNull(connections.deletedAt),
                  ),
                )
                .for('update')
              if (!c) throw new AppError('connection_unavailable', 404)
              await tx
                .update(grants)
                .set(
                  input.accept
                    ? { approvedAt: new Date() }
                    : { revokedAt: new Date() },
                )
                .where(and(eq(grants.id, g.id), isNull(grants.revokedAt)))
            })
            await ownedConnection(userId, g.connectionId)
            return auth.api.oauth2Consent({
              body: { accept: input.accept, oauth_query: input.oauthQuery },
              headers: request.headers,
            })
          },
        )
        break
      }
    }
    log({
      operation,
      outcome: 'success',
      correlation_id: correlationId,
      duration_ms: Date.now() - started,
    })
    return privateJson(result)
  } catch (error) {
    const category =
      error instanceof AppError
        ? error.category
        : error instanceof z.ZodError
          ? 'invalid_input'
          : 'account_request_failed'
    log({
      operation,
      outcome: 'failure',
      correlation_id: correlationId,
      duration_ms: Date.now() - started,
      severity: 'warn',
      error_category: category,
    })
    return privateJson(
      { error: category, correlationId },
      error instanceof AppError ? error.status : 400,
    )
  } finally {
    await finishLogs()
  }
}
