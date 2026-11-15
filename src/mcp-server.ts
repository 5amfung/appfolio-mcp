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
import {
  createWorkOrder,
  createWorkOrderInputSchema,
  createWorkOrderOutputSchema,
} from '@/mcp-tools/create-work-order'

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
// Handwritten workflows are separate from the generated upstream operation catalog.
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
const createWorkOrderSchemas = {
  input: mcpSchema(
    z.toJSONSchema(createWorkOrderInputSchema, {
      target: 'draft-7',
      io: 'input',
    }),
  ),
  output: mcpSchema({
    type: 'object',
    ...z.toJSONSchema(createWorkOrderOutputSchema, { target: 'draft-7' }),
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
            'Match tenant name, phone, optional email, and rented-unit address using the authorized AppFolio connection. Success requires exactly one Current tenant-unit match and a valid occupancy ID for work-order creation. Missing occupancy or ambiguous matches require review. Inspect status and error.failureClass; only authenticated permits creating a work order with the returned occupancy ID. Matching does not verify possession of a phone number or email address.',
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
      server.registerTool(
        'create_work_order',
        {
          description:
            'Create a work order using the occupancy ID from successful validate_tenant and a caller-selected priority. Sends description as JobDescription and always uses Status New, Type Internal, and PermissionToEnter false. Prior tenant validation is coordinated by the caller. Returns created with the AppFolio ID and optional link, or a specific failure status. outcome_unknown means the write may have completed; confirm AppFolio before retrying. Preserve metadata.idempotencyKey with unchanged arguments under the same authorization within 24 hours and respect metadata.retryAfter. Do not start a new write with a new key to recover an uncertain outcome. The general createWorkOrder tool remains available for other creation options.',
          inputSchema: createWorkOrderSchemas.input,
          outputSchema: createWorkOrderSchemas.output,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
          },
        },
        async (input) => createWorkOrder(input, identity),
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
