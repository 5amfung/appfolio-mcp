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
import {
  tenantSchema,
  unitSchema,
  type Tenant,
  type Unit,
  type ValidateTenantInput,
} from './schemas'
import { findTenantCandidates } from './matching'

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
})
const runtimeCache = () =>
  getCache({
    namespace: 'tenant-validation-v2',
    // The SDK default is a 32-bit hash. Isolation needs a collision-resistant key.
    keyHashFunction: (key) => createHash('sha256').update(key).digest('hex'),
  })

export function snapshotKey(
  owner: string,
  connection: ConnectionBinding,
  resource = 'tenants',
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        appUrl(),
        process.env.VERCEL_ENV ?? 'development',
        owner,
        connection.id,
        connection.version,
        'snapshot-v2',
        resource,
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

const unitSnapshotSchema = z.object({
  fetchedAt: z.number().int().nonnegative(),
  unit: unitSchema,
})
type Cache = ReturnType<typeof runtimeCache>
type UnitSnapshot = z.infer<typeof unitSnapshotSchema>

function fresh(fetchedAt: number, ttl: number) {
  const age = Date.now() - fetchedAt
  return age >= 0 && age < ttl * 1000
}

async function readCached<T extends { fetchedAt: number }>(
  cache: Cache,
  key: string,
  schema: z.ZodType<T>,
  ttl: number,
  identity: OperationIdentity,
): Promise<T | undefined> {
  const started = Date.now()
  try {
    const encrypted = await cache.get(key)
    if (typeof encrypted !== 'string') return undefined
    const parsed = schema.safeParse(JSON.parse(decrypt(encrypted, key)))
    if (parsed.success && fresh(parsed.data.fetchedAt, ttl)) return parsed.data
  } catch {
    return unreadableCacheMiss(identity, started)
  }
  return undefined
}

function unreadableCacheMiss(
  identity: OperationIdentity,
  started: number,
): undefined {
  log({
    operation: 'tenant_validation.cache_read',
    outcome: 'failure',
    correlation_id: identity.correlationId,
    duration_ms: Date.now() - started,
    error_category: 'tenant_cache_unavailable',
  })
  return undefined
}

async function storeCached(
  cache: Cache,
  key: string,
  value: { fetchedAt: number },
  ttl: number,
  identity: OperationIdentity,
  name: string,
) {
  const remaining = ttl - Math.ceil((Date.now() - value.fetchedAt) / 1000)
  if (remaining <= 0)
    throw new AppError('tenant_inventory_expired_during_load', 503)
  const encrypted = encrypt(JSON.stringify(value), key)
  if (Buffer.byteLength(encrypted) > 1900000)
    throw new AppError('tenant_inventory_cache_too_large', 503)
  const started = Date.now()
  try {
    await cache.set(key, encrypted, { ttl: remaining, name })
  } catch {
    continueWithFetchedRecord(identity, started)
  }
}

function continueWithFetchedRecord(
  identity: OperationIdentity,
  started: number,
) {
  log({
    operation: 'tenant_validation.cache_write',
    outcome: 'failure',
    correlation_id: identity.correlationId,
    duration_ms: Date.now() - started,
    error_category: 'tenant_cache_unavailable',
  })
}

export async function tenantSnapshot(
  identity: OperationIdentity,
  input: ValidateTenantInput,
) {
  const ttl = cacheTtlSeconds()
  const connection = await boundConnection(identity)
  const cache = runtimeCache()
  const deadline = Date.now() + 60000
  const tenantKey = snapshotKey(identity.userId, connection)
  let inventory = await readCached(
    cache,
    tenantKey,
    snapshotSchema,
    ttl,
    identity,
  )
  let hit = inventory !== undefined
  if (!inventory) {
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
    inventory = { fetchedAt, tenants }
    await boundConnection(identity, connection)
    await storeCached(
      cache,
      tenantKey,
      inventory,
      ttl,
      identity,
      'tenant-validation-tenants',
    )
  }

  const candidates = findTenantCandidates(input, inventory.tenants)
  const ids = [
    ...new Set(
      candidates
        .map(({ tenant }) => tenant.UnitId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const unitEntries: UnitSnapshot[] = []
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100)
    const cached = await Promise.all(
      batch.map(async (id) => {
        const value = await readCached(
          cache,
          snapshotKey(identity.userId, connection, 'unit:' + id),
          unitSnapshotSchema,
          ttl,
          identity,
        )
        return value?.unit.Id === id ? value : undefined
      }),
    )
    const missing = batch.filter((_, index) => cached[index] === undefined)
    for (const entry of cached) if (entry) unitEntries.push(entry)
    if (!missing.length) continue
    hit = false
    const fetchedAt = Date.now()
    const units = await loadPages(
      operation('getUnits'),
      { Id: missing.join(',') },
      unitSchema,
      identity,
      connection,
      deadline,
    )
    if (
      units.some((unit) => !missing.includes(unit.Id)) ||
      new Set(units.map((unit) => unit.Id)).size !== units.length
    )
      throw new AppError('tenant_unit_response_mismatch', 503)
    await boundConnection(identity, connection)
    const presentUnits = units.map((unit) => ({ fetchedAt, unit }))
    await Promise.all(
      presentUnits.map((entry) =>
        storeCached(
          cache,
          snapshotKey(identity.userId, connection, 'unit:' + entry.unit.Id),
          entry,
          ttl,
          identity,
          'tenant-validation-unit',
        ),
      ),
    )
    unitEntries.push(...presentUnits)
  }

  await boundConnection(identity, connection)
  const oldestFetchedAt = Math.min(
    inventory.fetchedAt,
    ...unitEntries.map((entry) => entry.fetchedAt),
  )
  if (!fresh(oldestFetchedAt, ttl))
    throw new AppError('tenant_inventory_expired_during_load', 503)
  return {
    fetchedAt: oldestFetchedAt,
    tenants: inventory.tenants,
    units: unitEntries.map((entry) => entry.unit),
    cache: hit ? ('hit' as const) : ('miss' as const),
  }
}

export type TenantSnapshot = {
  fetchedAt: number
  tenants: Tenant[]
  units: Unit[]
}
