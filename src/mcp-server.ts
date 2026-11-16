import { randomUUID } from 'node:crypto'
import {
  createMcpHandler,
  McpServer,
  fromJsonSchema,
} from '@modelcontextprotocol/server'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv'
import { z } from 'zod'
import { requireMcpAuth } from '@better-auth/mcp'
import { getAuth, appUrl, mcpScopes } from '@/server/auth'
import { activeGrant, claimsSchema, grantClaim } from '@/server/grants'
import { AppError } from '@/server/errors'
import { log, finishLogs } from '@/server/logging'
import { privateJson, jsonBody } from '@/server/http'
import { catalog, ajv, outputContract } from '@/appfolio/contract'
import { execute } from '@/appfolio/execute'
import {
  validateTenant,
  validateTenantInputSchema,
  validateTenantOutputSchema,
} from '@/mcp-tools/validate-tenant'

const schemaValidator = new AjvJsonSchemaValidator(ajv)
function isMcpJsonSchema(
  value: Record<string, unknown>,
): value is Parameters<typeof fromJsonSchema>[0] {
  return ajv.validateSchema(value) === true
}
function mcpSchema(value: Record<string, unknown>) {
  if (!isMcpJsonSchema(value))
    throw new Error('Generated JSON Schema is invalid')
  return fromJsonSchema(value, schemaValidator)
}
const tools = catalog.operations.map((op) => ({
  op,
  input: mcpSchema(op.inputSchema),
  output: mcpSchema(outputContract(op)),
}))
const validateTenantSchemas = {
  input: mcpSchema(
    z.toJSONSchema(validateTenantInputSchema, {
      target: 'draft-7',
      io: 'input',
    }),
  ),
  output: mcpSchema({
    type: 'object',
    ...z.toJSONSchema(validateTenantOutputSchema, { target: 'draft-7' }),
  }),
}

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
      server.registerTool(
        'validate_tenant',
        {
          description:
            'Match the tenant first name and phone number, then verify the rented-unit street address, city, and apartment or unit when applicable. Last name and email provide optional corroboration. Success requires exactly one Current tenant-unit match and a valid occupancy ID for work-order creation. Missing occupancy or ambiguous matches require review. Inspect status and error.failureClass; only authenticated permits creating a work order with the returned occupancy ID. Matching does not verify possession of a phone number or email address.',
          inputSchema: validateTenantSchemas.input,
          outputSchema: validateTenantSchemas.output,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        async (input) => validateTenant(input, identity),
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
      {
        resource: `${appUrl()}/api/mcp`,
        requiredScopes: ['mcp:tools'],
        challengeScopes: mcpScopes,
      },
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
