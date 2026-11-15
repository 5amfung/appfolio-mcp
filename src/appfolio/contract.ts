import { z } from 'zod'
import source from './catalog.json'
import { ajv } from './validation'

export { ajv } from './validation'

const parameter = z.object({
  name: z.string(),
  in: z.enum(['path', 'query', 'header', 'cookie']),
  style: z.string().optional(),
  explode: z.boolean().optional(),
  required: z.boolean().optional(),
})
const schema = z.record(z.string(), z.unknown())
const catalogSchema = z.object({
  sourceHash: z.string(),
  operations: z.array(
    z.object({
      name: z.string(),
      method: z.enum(['GET', 'POST', 'PATCH', 'DELETE', 'PUT']),
      path: z.string(),
      description: z.string(),
      deprecated: z.boolean(),
      parameters: z.array(parameter),
      mediaType: z.string(),
      inputSchema: schema,
      responses: z.record(z.string(), schema),
    }),
  ),
})
export const catalog = catalogSchema.parse(source)
export type Operation = (typeof catalog.operations)[number]
export const inputValidators = new Map(
  catalog.operations.map((o) => [o.name, ajv.compile(o.inputSchema)]),
)
export const inputSchema = z
  .object({
    path: z.record(z.string(), z.unknown()).optional(),
    query: z.record(z.string(), z.unknown()).optional(),
    header: z.record(z.string(), z.unknown()).optional(),
    body: z.unknown().optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict()
export type ToolInput = z.infer<typeof inputSchema>

export function outputContract(op: Operation) {
  const definitions: Record<string, unknown> = {}
  const variants = Object.values(op.responses).map((response) => {
    const { $defs, ...rest } = response
    const parsed = z.record(z.string(), z.unknown()).safeParse($defs)
    if (parsed.success) Object.assign(definitions, parsed.data)
    return rest
  })
  return {
    type: 'object',
    description:
      'AppFolio operation result. Inspect status and data, including any per-record failures; an accepted asynchronous request is not a completed write.',
    required: ['status', 'data', 'metadata'],
    properties: {
      status: {
        type: 'integer',
        description: 'HTTP status returned by AppFolio.',
      },
      data: {
        description:
          'Operation-specific AppFolio response body or error details.',
        anyOf: variants,
      },
      metadata: {
        type: 'object',
        description:
          'Request correlation and instructions for retries or replay.',
        required: ['upstreamStatus', 'retryAfter', 'correlationId'],
        properties: {
          idempotencyKey: {
            type: 'string',
            description:
              'Caller key to reuse with unchanged arguments under the same authorization when retrying this logical write within 24 hours.',
          },
          idempotentReplayed: {
            type: 'boolean',
            description:
              'Whether AppFolio reported replay of a recorded result.',
          },
          upstreamStatus: {
            type: 'integer',
            description: 'Upstream HTTP status.',
          },
          retryAfter: {
            type: ['string', 'null'],
            description:
              'Upstream Retry-After header, or null when absent. Respect its retry timing before another attempt.',
          },
          correlationId: {
            type: 'string',
            description:
              'Internal request identifier for correlating this result with application logs; not an AppFolio record ID.',
          },
        },
      },
    },
    $defs: definitions,
  }
}
