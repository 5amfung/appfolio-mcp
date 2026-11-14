import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { ajv } from '../src/appfolio/validation'

const schema = z.record(z.string(), z.unknown())
const catalog = z
  .object({
    operations: z.array(
      z.object({ name: z.string(), inputSchema: schema }).passthrough(),
    ),
  })
  .passthrough()
  .parse(JSON.parse(readFileSync(0, 'utf8')))

const omitted: { operation: string; schemaPath: string; reason: string }[] = []

for (const operation of catalog.operations) {
  const definitions = operation.inputSchema.$defs
  function visit(node: Record<string, unknown>, path: string) {
    if (Array.isArray(node.examples)) {
      const validate = ajv.compile({ ...node, $defs: definitions })
      node.examples = node.examples.filter((example) => {
        if (validate(example)) return true
        omitted.push({
          operation: operation.name,
          schemaPath: path,
          reason: ajv.errorsText(validate.errors),
        })
        return false
      })
      if (node.examples.length === 0) delete node.examples
    }
    for (const key of ['properties', '$defs']) {
      const children = schema.safeParse(node[key])
      if (children.success) {
        node[key] = children.data
        for (const [name, child] of Object.entries(children.data)) {
          const parsed = schema.parse(child)
          children.data[name] = parsed
          visit(parsed, `${path}.${key}.${name}`)
        }
      }
    }
    const items = schema.safeParse(node.items)
    if (items.success) {
      node.items = items.data
      visit(items.data, `${path}.items`)
    }
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      const children = z.array(schema).safeParse(node[key])
      if (children.success) {
        node[key] = children.data
        children.data.forEach((child, index) =>
          visit(child, `${path}.${key}[${index}]`),
        )
      }
    }
  }
  visit(operation.inputSchema, 'input')
}

process.stdout.write(
  JSON.stringify({ ...catalog, omittedDocumentationExamples: omitted }),
)
