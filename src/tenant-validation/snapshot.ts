import { createHash } from 'node:crypto'
import { getCache } from '@vercel/functions'
import { z } from 'zod'
import { catalog, type Operation } from '@/appfolio/contract'
import {
  runOperation,
  type OperationIdentity,
  type ConnectionBinding,
} from '@/appfolio/execute'
import { appUrl } from '@/server/auth'
import { activeGrant } from '@/server/grants'
import { encrypt, decrypt } from '@/server/crypto'
import { AppError } from '@/server/errors'
import { log } from '@/server/logging'
import { tenantSchema, unitSchema, type Tenant, type Unit } from './schemas'

export function cacheTtlSeconds() {
  const value = process.env.TENANT_VALIDATION_CACHE_TTL_SECONDS ?? '43200'
  if (!/^[1-9]\d*$/.test(value))
    throw new AppError('invalid_tenant_cache_ttl', 503)
  const seconds = Number(value)
  if (!Number.isSafeInteger(seconds) || seconds > 604800)
    throw new AppError('invalid_tenant_cache_ttl', 503)
  return seconds
}

const snapshotSchema = z.object({
  fetchedAt: z.number().int().nonnegative(),
  tenants: z.array(tenantSchema),
  units: z.array(unitSchema),
})
const runtimeCache = () =>
  getCache({
    namespace: 'tenant-validation-v1',
    // The SDK default is a 32-bit hash. Isolation needs a collision-resistant key.
    keyHashFunction: (key) => createHash('sha256').update(key).digest('hex'),
  })

export function snapshotKey(owner: string, connection: ConnectionBinding) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        appUrl(),
        process.env.VERCEL_ENV ?? 'development',
        owner,
        connection.id,
        connection.version,
        'snapshot-v1',
      ]),
    )
    .digest('hex')
}

async function boundConnection(
  identity: OperationIdentity,
  expected?: ConnectionBinding,
) {
  const bound = await activeGrant(identity.grantId, identity.userId)
  if (bound.grant.clientId !== identity.clientId)
    throw new AppError('invalid_authorization', 401)
  if (
    expected &&
    (bound.connection.id !== expected.id ||
      bound.connection.version !== expected.version)
  )
    throw new AppError('connection_changed_retry', 409)
  return bound.connection
}

function operation(name: string) {
  const op = catalog.operations.find((item) => item.name === name)
  if (!op) throw new AppError('tenant_operation_unavailable', 503)
  return op
}

async function loadPages<T>(
  op: Operation,
  filters: Record<string, string>,
  itemSchema: z.ZodType<T>,
  identity: OperationIdentity,
  connection: ConnectionBinding,
  deadline: number,
) {
  const envelope = z.object({
    data: z.array(itemSchema),
    next_page_path: z.string().nullable().optional(),
  })
  const records: T[] = []
  const seen = new Set<string>()
  let page = 1
  while (true) {
    if (page > 20 || Date.now() >= deadline)
      throw new AppError('tenant_inventory_incomplete', 503)
    const result = await runOperation(
      op,
      { query: { filters, page: { number: page, size: 1000 } } },
      identity,
      connection,
    )
    if (Date.now() >= deadline)
      throw new AppError('tenant_inventory_incomplete', 503)
    if (result.status !== 200)
      throw new AppError('tenant_inventory_unavailable', 503)
    const value = envelope.parse(result.data)
    records.push(...value.data)
    if (records.length > 20000)
      throw new AppError('tenant_inventory_incomplete', 503)
    if (!value.next_page_path) return records
    if (seen.has(value.next_page_path))
      throw new AppError('tenant_pagination_repeated', 503)
    seen.add(value.next_page_path)
    const next = new URL(
      value.next_page_path,
      'https://api.appfolio.com/api/v0/',
    )
    const nextPage = Number(next.searchParams.get('page[number]'))
    if (
      next.origin !== 'https://api.appfolio.com' ||
      next.pathname !== '/api/v0' + op.path ||
      nextPage !== page + 1
    )
      throw new AppError('tenant_pagination_invalid', 503)
    page = nextPage
  }
}

// Publish tenants and their unit addresses together. Partial fills never enter cache.
async function loadSnapshot(
  identity: OperationIdentity,
  connection: ConnectionBinding,
) {
  const deadline = Date.now() + 60000
  const fetchedAt = Date.now()
  const tenants = await loadPages(
    operation('getTenants'),
    {
      LastUpdatedAtFrom: '1970-01-01T00:00:00Z',
      Status: 'Current',
    },
    tenantSchema,
    identity,
    connection,
    deadline,
  )
  const ids = [
    ...new Set(
      tenants.map((t) => t.UnitId).filter((id): id is string => Boolean(id)),
    ),
  ]
  const units: Unit[] = []
  for (let start = 0; start < ids.length; start += 100) {
    units.push(
      ...(await loadPages(
        operation('getUnits'),
        { Id: ids.slice(start, start + 100).join(',') },
        unitSchema,
        identity,
        connection,
        deadline,
      )),
    )
  }
  return { fetchedAt, tenants, units }
}

export async function tenantSnapshot(identity: OperationIdentity) {
  const ttl = cacheTtlSeconds()
  const connection = await boundConnection(identity)
  const key = snapshotKey(identity.userId, connection)
  const cache = runtimeCache()
  let cached: unknown
  const cacheReadStarted = Date.now()
  try {
    cached = await cache.get(key)
  } catch {
    log({
      operation: 'tenant_validation.cache_read',
      outcome: 'failure',
      correlation_id: identity.correlationId,
      duration_ms: Date.now() - cacheReadStarted,
      error_category: 'tenant_cache_unavailable',
    })
  }
  if (typeof cached === 'string') {
    let parsed: ReturnType<typeof snapshotSchema.safeParse> | undefined
    try {
      parsed = snapshotSchema.safeParse(JSON.parse(decrypt(cached, key)))
    } catch {
      /* Corrupt or obsolete encryption key: refill. */
    }
    if (
      parsed?.success &&
      parsed.data.fetchedAt <= Date.now() &&
      Date.now() - parsed.data.fetchedAt < ttl * 1000
    ) {
      await boundConnection(identity, connection)
      if (Date.now() - parsed.data.fetchedAt < ttl * 1000)
        return { ...parsed.data, cache: 'hit' as const }
    }
  }
  const snapshot = await loadSnapshot(identity, connection)
  await boundConnection(identity, connection)
  const remaining = ttl - Math.ceil((Date.now() - snapshot.fetchedAt) / 1000)
  if (remaining <= 0)
    throw new AppError('tenant_inventory_expired_during_load', 503)
  const encrypted = encrypt(JSON.stringify(snapshot), key)
  if (Buffer.byteLength(encrypted) > 1900000)
    throw new AppError('tenant_inventory_cache_too_large', 503)
  const cacheWriteStarted = Date.now()
  try {
    await cache.set(key, encrypted, {
      ttl: remaining,
      name: 'tenant-validation-snapshot',
    })
  } catch {
    log({
      operation: 'tenant_validation.cache_write',
      outcome: 'failure',
      correlation_id: identity.correlationId,
      duration_ms: Date.now() - cacheWriteStarted,
      error_category: 'tenant_cache_unavailable',
    })
  }
  await boundConnection(identity, connection)
  if (Date.now() - snapshot.fetchedAt >= ttl * 1000)
    throw new AppError('tenant_inventory_expired_during_load', 503)
  return { ...snapshot, cache: 'miss' as const }
}

export type TenantSnapshot = {
  fetchedAt: number
  tenants: Tenant[]
  units: Unit[]
}
