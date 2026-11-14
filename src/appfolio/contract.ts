import { z } from 'zod'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import source from './catalog.json'

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
export const ajv = new Ajv({
  strict: false,
  allErrors: true,
  validateFormats: true,
})
addFormats(ajv)
ajv.addFormat('decimal', {
  type: 'string',
  validate: (v) => /^-?\d+(\.\d+)?$/.test(v),
})
ajv.addFormat('float', { type: 'number', validate: Number.isFinite })
ajv.addFormat('string', true)
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
    required: ['status', 'data', 'metadata'],
    properties: {
      status: { type: 'integer' },
      data: { anyOf: variants },
      metadata: {
        type: 'object',
        required: ['upstreamStatus', 'retryAfter', 'correlationId'],
        properties: {
          idempotencyKey: { type: 'string' },
          upstreamStatus: { type: 'integer' },
          retryAfter: { type: ['string', 'null'] },
          correlationId: { type: 'string' },
        },
      },
    },
    $defs: definitions,
  }
}
