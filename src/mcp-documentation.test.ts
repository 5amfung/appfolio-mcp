// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { protocolHandler } from './mcp-server'
import { ajv } from './appfolio/contract'

const schemaNode = z.record(z.string(), z.unknown())
const propertyMap = z.record(z.string(), schemaNode)
function parseJson(text: string): unknown {
  return JSON.parse(text)
}

const sourceOperation = z.object({
  operationId: z.string(),
  parameters: z
    .array(
      z.object({
        name: z.string(),
        in: z.string(),
        description: z.string().optional(),
        schema: schemaNode,
      }),
    )
    .default([]),
  requestBody: z
    .object({
      description: z.string().optional(),
      content: z.record(
        z.string(),
        z.object({ schema: schemaNode, example: z.unknown().optional() }),
      ),
    })
    .optional(),
})
const source = z
  .object({
    paths: z.record(z.string(), z.record(z.string(), sourceOperation)),
  })
  .parse(
    parseJson(
      readFileSync(
        new URL('../database-api-openapi.json', import.meta.url),
        'utf8',
      ),
    ),
  )
const sourceOperations = Object.values(source.paths).flatMap((path) =>
  Object.values(path),
)
const documentationAudit = z
  .object({
    omittedDocumentationExamples: z.array(
      z.object({
        operation: z.string(),
        schemaPath: z.string(),
        reason: z.string().min(1),
      }),
    ),
  })
  .parse(
    parseJson(
      readFileSync(new URL('./appfolio/catalog.json', import.meta.url), 'utf8'),
    ),
  )
const publishedTool = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: schemaNode,
})
type PublishedTool = z.infer<typeof publishedTool>
let tools: Map<string, PublishedTool>

function properties(schema: Record<string, unknown>) {
  return propertyMap.parse(schema.properties)
}

function field(schema: Record<string, unknown>, ...names: string[]) {
  for (const name of names) schema = schemaNode.parse(properties(schema)[name])
  return schema
}

function tool(name: string) {
  const result = tools.get(name)
  if (!result) throw new Error(`Missing published tool ${name}`)
  return result
}

function help(schema: Record<string, unknown>) {
  return z.string().min(1).parse(schema.description)
}

function examples(schema: Record<string, unknown>) {
  return z.array(z.unknown()).min(1).parse(schema.examples)
}

function normalizeHelp(text: string) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function validateAt(
  root: Record<string, unknown>,
  node: Record<string, unknown>,
) {
  return ajv.compile({
    ...node,
    ...('$defs' in root ? { $defs: root.$defs } : {}),
  })
}

function expectSourceExample(
  root: Record<string, unknown>,
  node: Record<string, unknown>,
  example: unknown,
  operation: string,
  schemaPath: string,
) {
  const published = z.array(z.unknown()).parse(node.examples ?? [])
  if (validateAt(root, node)(example)) {
    expect(published, `${operation}:${schemaPath}`).toContainEqual(example)
  } else {
    expect(published, `${operation}:${schemaPath}`).not.toContainEqual(example)
    expect(documentationAudit.omittedDocumentationExamples).toContainEqual({
      operation,
      schemaPath,
      reason: expect.any(String),
    })
  }
}

function walkSchema(
  node: Record<string, unknown>,
  visit: (node: Record<string, unknown>, path: string) => void,
  path = 'input',
) {
  visit(node, path)
  for (const key of ['properties', '$defs']) {
    if (!(key in node)) continue
    for (const [name, child] of Object.entries(propertyMap.parse(node[key])))
      walkSchema(child, visit, `${path}.${key}.${name}`)
  }
  if ('items' in node)
    walkSchema(schemaNode.parse(node.items), visit, `${path}.items`)
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (!(key in node)) continue
    z.array(schemaNode)
      .parse(node[key])
      .forEach((child, index) =>
        walkSchema(child, visit, `${path}.${key}[${index}]`),
      )
  }
}

beforeAll(async () => {
  const response = await protocolHandler({
    userId: 'documentation-test-user',
    grantId: 'documentation-test-grant',
    clientId: 'documentation-test-client',
    correlationId: 'documentation-test-request',
  }).fetch(
    new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
  )
  expect(response.status).toBe(200)
  const text = await response.text()
  const payload = response.headers
    .get('content-type')
    ?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => parseJson(line.slice(5)))
        .find((message) => schemaNode.parse(message).result !== undefined)
    : parseJson(text)
  const listed = z
    .object({ result: z.object({ tools: z.array(publishedTool) }) })
    .parse(payload)
  tools = new Map(listed.result.tools.map((item) => [item.name, item]))
})

describe('agent-visible MCP documentation', () => {
  it('publishes the complete operation catalog through the actual protocol', () => {
    expect(tools.size).toBe(181)
    expect([...tools.keys()].sort()).toEqual(
      sourceOperations.map((operation) => operation.operationId).sort(),
    )
    for (const item of tools.values())
      expect(item.description.trim()).not.toBe('')
  })

  it('keeps parameter-level meaning and scalar examples where agents enter values', () => {
    for (const operation of sourceOperations) {
      const schema = tool(operation.operationId).inputSchema
      for (const parameter of operation.parameters) {
        const published = field(schema, parameter.in, parameter.name)
        if (parameter.description)
          expect(
            normalizeHelp(help(published)),
            `${operation.operationId}.${parameter.name}`,
          ).toContain(normalizeHelp(parameter.description))
        if ('example' in parameter.schema)
          expectSourceExample(
            schema,
            published,
            parameter.schema.example,
            operation.operationId,
            `input.properties.${parameter.in}.properties.${parameter.name}`,
          )
      }
    }
  })

  it('retains body context and compatible source examples, with an audit for incompatible examples', () => {
    for (const operation of sourceOperations) {
      if (!operation.requestBody) continue
      const schema = tool(operation.operationId).inputSchema
      const body = field(schema, 'body')
      if (operation.requestBody.description)
        expect(normalizeHelp(help(body)), operation.operationId).toContain(
          normalizeHelp(operation.requestBody.description),
        )
      const json = operation.requestBody.content['application/json']
      if (json && 'example' in json)
        expectSourceExample(
          schema,
          body,
          json.example,
          operation.operationId,
          'input.properties.body',
        )
    }
  })

  it('documents every named input property, including referenced definitions and composed alternatives', () => {
    for (const item of tools.values())
      walkSchema(item.inputSchema, (node, path) => {
        if (!('properties' in node)) return
        for (const [name, property] of Object.entries(properties(node)))
          expect(
            normalizeHelp(help(property)),
            `${item.name}:${path}.${name}`,
          ).not.toBe('')
      })
  })

  it('publishes only examples accepted at their own schema location', () => {
    let checkedExamples = 0
    for (const item of tools.values())
      walkSchema(item.inputSchema, (node, path) => {
        if (!('examples' in node)) return
        const validate = validateAt(item.inputSchema, node)
        for (const example of examples(node)) {
          const valid = validate(example)
          expect(
            valid,
            `${item.name}:${path}: ${ajv.errorsText(validate.errors)}`,
          ).toBe(true)
          checkedExamples += 1
        }
      })
    expect(checkedExamples).toBeGreaterThan(0)
  })

  it('explains argument groups and pagination without requiring URL syntax', () => {
    for (const item of tools.values()) {
      for (const name of ['path', 'query', 'header', 'body']) {
        const group = properties(item.inputSchema)[name]
        if (group) expect(help(group), `${item.name}.${name}`).not.toBe('')
      }
      const query = properties(item.inputSchema).query
      const page = query && properties(query).page
      if (!page) continue
      expect(help(page), item.name).toMatch(/pag|page/i)
      expect(help(field(page, 'number'))).toMatch(/page|1|one/i)
      expect(help(field(page, 'size'))).toMatch(/size|record|result|1000/i)
      expect(examples(page)).not.toHaveLength(0)
    }
    expect(help(field(tool('getWorkOrders').inputSchema, 'query'))).toMatch(
      /nested|object/i,
    )
  })

  it('explains upload bytes and idempotent retries on every applicable tool', () => {
    for (const operation of sourceOperations) {
      const schema = tool(operation.operationId).inputSchema
      const key = properties(schema).idempotencyKey
      if (key) {
        expect(help(key), operation.operationId).toMatch(/retr|same|logical/i)
        expect(examples(key)).not.toHaveLength(0)
      }
      if (!operation.requestBody?.content['multipart/form-data']) continue
      const upload = field(schema, 'body', 'File')
      expect(help(upload), operation.operationId).toMatch(/file|upload|byte/i)
      expect(help(field(upload, 'filename'))).toMatch(/name/i)
      expect(help(field(upload, 'mediaType'))).toMatch(/MIME|media|content/i)
      expect(help(field(upload, 'base64'))).toMatch(/base64/i)
      expect(examples(upload)).not.toHaveLength(0)
    }
  })

  it('publishes complete filter alternatives and preserves the inclusive choice', () => {
    const schema = tool('getWorkOrders').inputSchema
    const filters = field(schema, 'query', 'filters')
    const choices = z.array(schemaNode).parse(filters.anyOf)
    expect(choices).toHaveLength(2)
    for (const choice of choices) {
      const named = properties(choice)
      for (const name of [
        'Id',
        'LastUpdatedAtFrom',
        'PropertyId',
        'WorkOrderStatus',
      ])
        expect(named, name).toHaveProperty(name)
      expect(help(named.Id)).toMatch(/work order/i)
      expect(help(named.LastUpdatedAtFrom)).toMatch(/updated/i)
    }
    const validate = ajv.compile(schema)
    const id = '11111111-1111-4111-8111-111111111111'
    const updatedSince = '2026-11-01T00:00:00Z'
    expect(validate({ query: { filters: { Id: id } } })).toBe(true)
    expect(
      validate({ query: { filters: { LastUpdatedAtFrom: updatedSince } } }),
    ).toBe(true)
    expect(
      validate({
        query: {
          filters: { Id: id, LastUpdatedAtFrom: updatedSince },
          page: { number: 2, size: 20 },
        },
      }),
    ).toBe(true)
    expect(validate({ query: { filters: {} } })).toBe(false)
    expect(
      validate({ query: { filters: { LastUpdatedAtFrom: 'yesterday' } } }),
    ).toBe(false)
  })

  it('publishes common work-order fields for each exclusive target and keeps validation', () => {
    const schema = tool('createWorkOrder').inputSchema
    const body = field(schema, 'body')
    const choices = z.array(schemaNode).parse(body.oneOf)
    const targetNames = [
      'PropertyId',
      'UnitId',
      'OccupancyId',
      'InspectionId',
      'ServiceRequestId',
    ]
    expect(choices).toHaveLength(targetNames.length)
    for (const choice of choices) {
      const names = z.array(z.string()).parse(choice.required)
      const target = targetNames.find((name) => names.includes(name))
      expect(target).toBeDefined()
      const named = properties(choice)
      expect(help(named.JobDescription)).toMatch(/description|work order/i)
      expect(named).toHaveProperty('Priority')
      if (target) expect(help(named[target])).not.toBe('')
    }
    const validate = ajv.compile(schema)
    const bodyInput = {
      JobDescription: 'Repair the leaking kitchen faucet.',
      PropertyId: '11111111-1111-4111-8111-111111111111',
      Priority: 'Normal',
    }
    expect(validate({ body: bodyInput })).toBe(true)
    expect(
      validate({ body: { JobDescription: bodyInput.JobDescription } }),
    ).toBe(false)
    expect(validate({ body: { PropertyId: bodyInput.PropertyId } })).toBe(false)
    expect(
      validate({
        body: {
          ...bodyInput,
          UnitId: '22222222-2222-4222-8222-222222222222',
        },
      }),
    ).toBe(false)
  })

  it('accepts a realistic upload object and rejects paths masquerading as file bytes', () => {
    const validate = ajv.compile(tool('createWorkOrderAttachment').inputSchema)
    const path = { WorkOrderId: '11111111-1111-4111-8111-111111111111' }
    expect(
      validate({
        path,
        body: {
          File: {
            filename: 'note.txt',
            mediaType: 'text/plain',
            base64: 'aGVsbG8=',
          },
        },
        idempotencyKey: 'upload-note-2026-11-14',
      }),
    ).toBe(true)
    expect(validate({ path, body: { File: '/home/user/note.txt' } })).toBe(
      false,
    )
    expect(validate({ body: { File: { base64: 'aGVsbG8=' } } })).toBe(false)
  })
})
