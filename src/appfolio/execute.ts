import { createHash, randomUUID } from 'node:crypto'
import { eq, and, isNull, or, lt, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/index.server'
import { retries, jobs, connections } from '@/db/schema'
import { activeGrant } from '@/server/grants'
import { connectionToken, readCredentials } from '@/server/connections'
import { encrypt, decrypt } from '@/server/crypto'
import { AppError } from '@/server/errors'
import { log } from '@/server/logging'
import { ajv, inputSchema, inputValidators, type Operation } from './contract'
import {
  serializeUrl,
  serializeBody,
  stableJson,
  boundedResponse,
} from './request'

export async function execute(
  op: Operation,
  raw: unknown,
  identity: {
    userId: string
    grantId: string
    clientId: string
    correlationId: string
  },
) {
  const started = Date.now()
  let key: string | undefined
  let upstreamStatus: number | undefined
  try {
    const input = inputSchema.parse(raw)
    if (!inputValidators.get(op.name)?.(input))
      throw new AppError('invalid_tool_input')
    const bound = await activeGrant(identity.grantId, identity.userId)
    if (bound.grant.clientId !== identity.clientId)
      throw new AppError('invalid_authorization', 401)
    if (op.name === 'getjobs') {
      const filters = z.object({ Id: z.string() }).parse(input.query?.filters)
      const ids = filters.Id.split(',')
      const owned = await getDb()
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.grantId, identity.grantId),
            inArray(jobs.upstreamId, ids),
          ),
        )
      if (
        ids.some(
          (id) =>
            !owned.some(
              (job) =>
                job.upstreamId === id &&
                job.createdAt.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000,
            ),
        )
      )
        throw new AppError('job_not_owned_by_authorization_or_expired', 403)
      const [poll] = await getDb()
        .update(connections)
        .set({ jobsPollAfter: new Date(Date.now() + 3100) })
        .where(
          and(
            eq(connections.id, bound.connection.id),
            isNull(connections.deletedAt),
            or(
              isNull(connections.jobsPollAfter),
              lt(connections.jobsPollAfter, new Date()),
            ),
          ),
        )
        .returning({ id: connections.id })
      if (!poll)
        throw new AppError('job_poll_rate_limited_wait_four_seconds', 429)
    }
    const auth = await connectionToken(
      identity.userId,
      bound.connection.id,
      identity.correlationId,
    )
    const { url, headers } = serializeUrl(op, input)
    let { bytes, contentType } = serializeBody(op, input)
    const mutation = ['POST', 'PUT', 'PATCH'].includes(op.method)
    if (mutation) {
      key = input.idempotencyKey || randomUUID()
      const id = createHash('sha256')
        .update(identity.grantId + ':' + new URL(url).pathname + ':' + key)
        .digest('hex')
      const fingerprint = createHash('sha256')
        .update(
          stableJson({
            operation: op.name,
            url,
            headers: [...headers],
            body: input.body ?? null,
          }),
        )
        .digest('hex')
      const upstreamKey = id.slice(0, 32)
      await getDb()
        .insert(retries)
        .values({
          id,
          grantId: identity.grantId,
          operation: op.name,
          fingerprint,
          body: encrypt(bytes.toString('base64'), `${id}:retry`),
          contentType,
          upstreamKey,
        })
        .onConflictDoNothing()
      const [saved] = await getDb()
        .select()
        .from(retries)
        .where(eq(retries.id, id))
      if (
        !saved ||
        saved.grantId !== identity.grantId ||
        saved.fingerprint !== fingerprint
      )
        throw new AppError('idempotency_payload_mismatch', 422)
      if (saved.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000)
        throw new AppError(
          'idempotency_key_expired_confirm_before_new_operation',
          409,
        )
      bytes = Buffer.from(decrypt(saved.body, `${id}:retry`), 'base64')
      contentType = saved.contentType
      headers.set('Idempotency-Key', saved.upstreamKey)
    }
    const fresh = await activeGrant(identity.grantId, identity.userId)
    if (fresh.connection.version !== auth.connection.version)
      throw new AppError('connection_changed_retry', 409)
    const creds = readCredentials(auth.connection)
    headers.set('Authorization', `Bearer ${auth.token}`)
    headers.set('X-AppFolio-Developer-ID', creds.developerId)
    headers.set('X-AppFolio-Database-ID', creds.databaseId)
    if (contentType) headers.set('Content-Type', contentType)
    let response: Response
    try {
      response = await fetch(url, {
        method: op.method,
        headers,
        body: bytes.length ? new Uint8Array(bytes) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      throw new AppError(
        op.method === 'GET'
          ? 'upstream_unavailable'
          : 'write_outcome_unknown_confirm_upstream_before_retry',
        502,
      )
    }
    upstreamStatus = response.status
    const text = await boundedResponse(response)
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        throw new AppError('upstream_invalid_json', 502)
      }
    }
    const responseSchema =
      op.responses[String(response.status)] ?? op.responses.default
    if (!responseSchema) throw new AppError('upstream_undocumented_status', 502)
    if (!ajv.validate(responseSchema, data))
      throw new AppError('upstream_contract_mismatch', 502)
    if (response.ok && op.path.endsWith('/async')) {
      const job = z.object({ JobId: z.string().uuid() }).parse(data)
      const id = createHash('sha256')
        .update(identity.grantId + ':' + job.JobId)
        .digest('hex')
      await getDb()
        .insert(jobs)
        .values({ id, grantId: identity.grantId, upstreamId: job.JobId })
        .onConflictDoNothing()
    }
    const metadata = {
      idempotencyKey: key,
      upstreamStatus: response.status,
      retryAfter: response.headers.get('Retry-After'),
      idempotentReplayed:
        response.headers.get('Idempotent-Replayed') === 'true',
      correlationId: identity.correlationId,
    }
    const result = { status: response.status, data, metadata }
    log({
      operation: op.name,
      outcome: response.ok ? 'success' : 'failure',
      correlation_id: identity.correlationId,
      duration_ms: Date.now() - started,
      upstream_status: response.status,
      rate_limited: response.status === 429,
      retries: 0,
    })
    return {
      isError: !response.ok,
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      structuredContent: result,
    }
  } catch (error) {
    const category =
      error instanceof AppError ? error.category : 'tool_execution_failed'
    log({
      operation: op.name,
      outcome: 'failure',
      correlation_id: identity.correlationId,
      duration_ms: Date.now() - started,
      severity: 'error',
      error_category: category,
      upstream_status: upstreamStatus,
      retries: 0,
    })
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: category,
            status: error instanceof AppError ? error.status : 500,
            idempotencyKey: key,
            upstreamStatus,
            correlationId: identity.correlationId,
          }),
        },
      ],
    }
  }
}
