import { z } from 'zod'
import { catalog } from '@/appfolio/contract'
import {
  runOperation,
  OperationError,
  type OperationIdentity,
} from '@/appfolio/execute'

const prioritySchema = z.enum(['Urgent', 'Normal', 'Low'])
export const createWorkOrderInputSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1)
      .describe('Maintenance request text, sent as AppFolio JobDescription.'),
    occupancyId: z
      .uuid()
      .describe('Occupancy ID returned by successful tenant validation.'),
    priority: prioritySchema.describe(
      'Caller-selected priority. The tool does not infer urgency.',
    ),
    idempotencyKey: z
      .string()
      .max(256)
      .regex(/^[ -~]*$/)
      .optional()
      .describe(
        'Key identifying this logical write. Reuse it with unchanged arguments under the same authorization within 24 hours. Omit or pass an empty string to generate a key.',
      ),
  })
  .strict()

const metadataSchema = z
  .object({
    correlationId: z.string(),
    idempotencyKey: z.string().optional(),
    upstreamStatus: z.number().int().optional(),
    retryAfter: z.string().nullable().optional(),
    idempotentReplayed: z.boolean().optional(),
    errorCategory: z.string().optional(),
  })
  .strict()
const createdSchema = z
  .object({
    status: z.literal('created'),
    message: z.string(),
    metadata: metadataSchema,
    workOrder: z
      .object({
        description: z.string(),
        id: z.uuid(),
        link: z.url().optional(),
        occupancyId: z.uuid(),
        permissionToEnter: z.literal(false),
        priority: prioritySchema,
        status: z.literal('New'),
        type: z.literal('Internal'),
      })
      .strict(),
  })
  .strict()
const failureSchema = z
  .object({
    status: z.enum([
      'needs_more_information',
      'not_created',
      'service_unavailable',
      'outcome_unknown',
    ]),
    message: z.string(),
    metadata: metadataSchema,
    error: z
      .object({
        failureClass: z.enum([
          'input_validation',
          'appfolio_rejected',
          'appfolio_unavailable',
          'write_outcome_unknown',
        ]),
      })
      .strict(),
  })
  .strict()
export const createWorkOrderOutputSchema = z.union([
  createdSchema,
  failureSchema,
])
export type CreateWorkOrderOutput = z.infer<typeof createWorkOrderOutputSchema>

const operation = (() => {
  const found = catalog.operations.find((op) => op.name === 'createWorkOrder')
  if (!found) throw new Error('Missing createWorkOrder operation')
  return found
})()
const createdResponseSchema = z.object({
  Id: z.uuid(),
  Link: z.url().optional(),
})

export async function createWorkOrder(
  raw: unknown,
  identity: OperationIdentity,
) {
  const parsed = createWorkOrderInputSchema.safeParse(raw)
  if (!parsed.success)
    return result({
      status: 'needs_more_information',
      message: 'Required work order information is missing or invalid.',
      metadata: { correlationId: identity.correlationId },
      error: { failureClass: 'input_validation' },
    })
  const input = parsed.data
  try {
    const envelope = await runOperation(
      operation,
      {
        body: {
          JobDescription: input.description,
          OccupancyId: input.occupancyId,
          PermissionToEnter: false,
          Priority: input.priority,
          Status: 'New',
          Type: 'Internal',
        },
        idempotencyKey: input.idempotencyKey,
      },
      identity,
    )
    if (envelope.status === 201) {
      const created = createdResponseSchema.safeParse(envelope.data)
      if (created.success)
        return result({
          status: 'created',
          message: 'Work order created.',
          metadata: envelope.metadata,
          workOrder: {
            description: input.description,
            id: created.data.Id,
            link: created.data.Link,
            occupancyId: input.occupancyId,
            permissionToEnter: false,
            priority: input.priority,
            status: 'New',
            type: 'Internal',
          },
        })
      return unknownOutcome(envelope.metadata)
    }
    if (envelope.status >= 500) return unknownOutcome(envelope.metadata)
    return result({
      status: envelope.status === 429 ? 'service_unavailable' : 'not_created',
      message:
        envelope.status === 429
          ? 'Work order creation is rate limited. Respect retryAfter before retrying with the same key.'
          : 'AppFolio rejected the work order creation request.',
      metadata: envelope.metadata,
      error: {
        failureClass:
          envelope.status === 429
            ? 'appfolio_unavailable'
            : 'appfolio_rejected',
      },
    })
  } catch (error) {
    if (!(error instanceof OperationError)) throw error
    const metadata = {
      correlationId: identity.correlationId,
      idempotencyKey: error.idempotencyKey,
      upstreamStatus: error.upstreamStatus,
      errorCategory: error.category,
    }
    if (
      error.category ===
        'write_outcome_unknown_confirm_upstream_before_retry' ||
      (error.upstreamStatus !== undefined &&
        ((error.upstreamStatus >= 200 && error.upstreamStatus < 300) ||
          error.upstreamStatus >= 500)) ||
      [
        'upstream_invalid_json',
        'upstream_contract_mismatch',
        'upstream_undocumented_status',
      ].includes(error.category)
    )
      return unknownOutcome(metadata)
    return result({
      status: 'service_unavailable',
      message:
        'Work order creation could not proceed. Inspect metadata.errorCategory and preserve the idempotency key for recovery.',
      metadata,
      error: { failureClass: 'appfolio_unavailable' },
    })
  }
}

function unknownOutcome(metadata: z.infer<typeof metadataSchema>) {
  return result({
    status: 'outcome_unknown',
    message:
      'Creation may have completed. Confirm AppFolio before retrying. Preserve the idempotency key and unchanged arguments; do not start another write with a new key.',
    metadata,
    error: { failureClass: 'write_outcome_unknown' },
  })
}
function result(output: CreateWorkOrderOutput) {
  const sanitized = createWorkOrderOutputSchema.parse(output)
  return {
    isError: sanitized.status !== 'created',
    content: [{ type: 'text' as const, text: JSON.stringify(sanitized) }],
    structuredContent: sanitized,
  }
}
