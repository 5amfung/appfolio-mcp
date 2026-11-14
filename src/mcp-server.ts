import { randomUUID } from 'node:crypto'
import {
  createMcpHandler,
  McpServer,
  fromJsonSchema,
} from '@modelcontextprotocol/server'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv'
import { z } from 'zod'
import { requireMcpAuth } from '@better-auth/mcp'
import { getAuth, appUrl } from '@/server/auth'
import { activeGrant, claimsSchema, grantClaim } from '@/server/grants'
import { AppError } from '@/server/errors'
import { log, finishLogs } from '@/server/logging'
import { privateJson, jsonBody } from '@/server/http'
import { catalog, ajv, outputContract } from '@/appfolio/contract'
import { execute } from '@/appfolio/execute'

const schemaValidator = new AjvJsonSchemaValidator(ajv)
function mcpSchema(value: Record<string, unknown>) {
  if (!ajv.validateSchema(value))
    throw new Error('Generated JSON Schema is invalid')
  // AJV validates this generated boundary value before the SDK's structural type.
  return fromJsonSchema(
    value as Parameters<typeof fromJsonSchema>[0],
    schemaValidator,
  )
}
const tools = catalog.operations.map((op) => ({
  op,
  input: mcpSchema(op.inputSchema),
  output: mcpSchema(outputContract(op)),
}))

export function protocolHandler(identity: {
  userId: string
  grantId: string
  clientId: string
  correlationId: string
}) {
  return createMcpHandler(
    () => {
      const server = new McpServer({ name: 'appfolio-mcp', version: '0.1.0' })
      for (const { op, input, output } of tools)
        server.registerTool(
          op.name,
          {
            description: op.description,
            inputSchema: input,
            outputSchema: output,
            annotations: {
              readOnlyHint: op.method === 'GET',
              destructiveHint: op.method !== 'GET',
              idempotentHint: op.method === 'GET',
              openWorldHint: true,
            },
          },
          async (input) => execute(op, input, identity),
        )
      return server
    },
    { legacy: 'stateless' },
  )
}
export async function handleMcp(request: Request) {
  const correlationId = randomUUID(),
    start = Date.now()
  try {
    if (
      request.headers.has('origin') &&
      request.headers.get('origin') !== appUrl()
    )
      return privateJson({ error: 'invalid_origin' }, 403)
    const protectedHandler = requireMcpAuth(
      getAuth(),
      async (verifiedRequest, claims) => {
        const bearer = verifiedRequest.headers
          .get('authorization')
          ?.split(' ')[1]
        const encodedHeader = bearer?.split('.')[0]
        try {
          if (!encodedHeader) throw new Error('missing token')
          z.object({ typ: z.literal('at+jwt') }).parse(
            JSON.parse(
              Buffer.from(encodedHeader, 'base64url').toString('utf8'),
            ),
          )
        } catch {
          throw new AppError('invalid_access_token_type', 401)
        }
        const parsed = claimsSchema.parse(claims)
        const grantId = parsed[grantClaim]
        const active = await activeGrant(grantId, parsed.sub)
        if (active.grant.clientId !== parsed.client_id)
          throw new AppError('invalid_authorization', 401)
        let parsedBody: unknown
        if (verifiedRequest.method === 'POST')
          parsedBody = await jsonBody(verifiedRequest, 3_000_000)
        return protocolHandler({
          userId: parsed.sub,
          grantId,
          clientId: parsed.client_id,
          correlationId,
        }).fetch(verifiedRequest, { parsedBody })
      },
      { resource: `${appUrl()}/api/mcp`, requiredScopes: ['mcp:tools'] },
    )
    return await protectedHandler(request)
  } catch (error) {
    const category =
      error instanceof AppError ? error.category : 'mcp_request_failed'
    log({
      operation: 'mcp',
      outcome: 'rejected',
      correlation_id: correlationId,
      duration_ms: Date.now() - start,
      severity: 'warn',
      error_category: category,
    })
    return privateJson(
      { error: category, correlationId },
      error instanceof AppError ? error.status : 503,
    )
  } finally {
    await finishLogs()
  }
}
