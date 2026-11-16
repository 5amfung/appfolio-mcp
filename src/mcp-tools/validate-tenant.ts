import { z } from 'zod'
import type { OperationIdentity } from '@/appfolio/execute'
import { AppError } from '@/server/errors'
import { log } from '@/server/logging'
import { tenantSnapshot, cacheTtlSeconds } from '@/tenant-validation/snapshot'
import { evaluateTenant, emptyMatchSummary } from '@/tenant-validation/matching'
import {
  validateTenantInputSchema,
  validateTenantOutputSchema as domainOutputSchema,
  type ValidateTenantOutput,
} from '@/tenant-validation/schemas'

export { validateTenantInputSchema }
const metadataSchema = z
  .object({
    correlationId: z.string(),
    cache: z.enum(['hit', 'miss']).optional(),
    fetchedAt: z.iso.datetime().optional(),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict()
const [successSchema, ...failureSchemas] = domainOutputSchema.options
export const validateTenantOutputSchema = z.discriminatedUnion('status', [
  successSchema.extend({ metadata: metadataSchema }),
  ...failureSchemas.map((option) =>
    option.extend({ metadata: metadataSchema }),
  ),
])

export async function validateTenant(
  raw: unknown,
  identity: OperationIdentity,
) {
  const start = Date.now()
  let output: ValidateTenantOutput
  let metadata: {
    correlationId: string
    cache?: 'hit' | 'miss'
    fetchedAt?: string
    expiresAt?: string
  } = { correlationId: identity.correlationId }
  const parsed = validateTenantInputSchema.safeParse(raw)
  if (!parsed.success) {
    output = {
      status: 'needs_more_information',
      error: { failureClass: 'input_validation' },
      message: 'Required tenant information is missing or invalid.',
      match: emptyMatchSummary(),
    }
  } else {
    try {
      const snapshot = await tenantSnapshot(identity, parsed.data)
      output = evaluateTenant(parsed.data, snapshot.tenants, snapshot.units)
      metadata = {
        ...metadata,
        cache: snapshot.cache,
        fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
        expiresAt: new Date(
          snapshot.fetchedAt + cacheTtlSeconds() * 1000,
        ).toISOString(),
      }
    } catch (error) {
      const category =
        error instanceof AppError
          ? error.category
          : 'tenant_validation_unavailable'
      log({
        operation: 'validate_tenant',
        outcome: 'failure',
        correlation_id: identity.correlationId,
        duration_ms: Date.now() - start,
        error_category: category,
      })
      output = {
        status: 'service_unavailable',
        error: { failureClass: 'appfolio_unavailable' },
        message:
          'Tenant validation is unavailable. Retry later; no validation decision was made.',
        match: emptyMatchSummary(),
      }
    }
  }
  const result = validateTenantOutputSchema.parse({ ...output, metadata })
  log({
    operation: 'validate_tenant',
    outcome: output.status === 'authenticated' ? 'success' : 'failure',
    correlation_id: identity.correlationId,
    duration_ms: Date.now() - start,
  })
  return {
    isError: output.status === 'service_unavailable',
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result,
  }
}
