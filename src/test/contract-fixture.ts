export function fixture(
  schema: Record<string, unknown>,
  defs: Record<string, unknown> = {},
): unknown {
  const local = (schema.$defs ?? defs) as Record<string, unknown>
  if (typeof schema.$ref === 'string')
    return fixture(
      local[schema.$ref.split('/').at(-1)!] as Record<string, unknown>,
      local,
    )
  if (Array.isArray(schema.enum)) return schema.enum[0]
  if ('default' in schema) return schema.default
  const alternatives = (schema.oneOf ?? schema.anyOf) as
    Record<string, unknown>[] | undefined
  const parts = [
    schema,
    ...((schema.allOf as Record<string, unknown>[]) ?? []),
    ...(alternatives ? [alternatives[0]] : []),
  ]
  if (parts.length > 1) {
    function resolve(p: Record<string, unknown>): Record<string, unknown> {
      if (typeof p.$ref === 'string')
        return resolve(
          local[p.$ref.split('/').at(-1)!] as Record<string, unknown>,
        )
      const more = (p.allOf ?? []) as Record<string, unknown>[]
      return {
        ...p,
        properties: Object.assign(
          {},
          p.properties ?? {},
          ...more.map((s) => resolve(s).properties ?? {}),
        ),
      }
    }
    const props = Object.assign(
      {},
      ...parts.map((p) => resolve(p).properties ?? {}),
    )
    const required = [
      ...new Set(parts.flatMap((p) => (p.required ?? []) as string[])),
    ]
    return fixture(
      {
        ...schema,
        properties: props,
        required,
        allOf: undefined,
        oneOf: undefined,
        anyOf: undefined,
      },
      local,
    )
  }
  if (schema.type === 'object' || schema.properties) {
    const props = (schema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >
    const required = (schema.required ?? []) as string[]
    return Object.fromEntries(
      required.map((k) => [
        k,
        k === 'mediaType'
          ? 'text/plain'
          : k === 'base64'
            ? 'aGVsbG8='
            : fixture(props[k] ?? {}, local),
      ]),
    )
  }
  if (schema.type === 'array')
    return Array.from({ length: Number(schema.minItems ?? 0) }, () =>
      fixture(schema.items as Record<string, unknown>, local),
    )
  if (schema.type === 'integer' || schema.type === 'number')
    return schema.minimum ?? 1
  if (schema.type === 'boolean') return true
  if (schema.type === 'null') return null
  if (
    typeof schema.pattern === 'string' &&
    schema.pattern.includes('a-fA-F0-9')
  )
    return '11111111-1111-4111-8111-111111111111'
  if (schema.format === 'uuid') return '11111111-1111-4111-8111-111111111111'
  if (schema.format === 'date-time') return '2026-01-01T00:00:00Z'
  if (schema.format === 'date') return '2026-01-01'
  if (schema.format === 'decimal') return '1.00'
  return 'test'
}
