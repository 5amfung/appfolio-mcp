import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Operation, ToolInput } from './contract'
import { AppError } from '@/server/errors'

const fileSchema = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^\r\n/\\"]+$/)
      .refine((v) => !v.includes(String.fromCharCode(0))),
    mediaType: z.string().regex(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/),
    base64: z
      .string()
      .max(2796204)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
  })
  .strict()
const object = z.record(z.string(), z.unknown())
function scalar(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return String(value)
  throw new AppError('invalid_parameter_value')
}
function appendDeep(query: URLSearchParams, key: string, value: unknown) {
  if (value === undefined) return
  if (Array.isArray(value)) {
    query.append(key, value.map(scalar).join(','))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value))
      appendDeep(query, `${key}[${k}]`, v)
    return
  }
  query.append(key, value === null ? '' : scalar(value))
}
export function serializeUrl(op: Operation, input: ToolInput) {
  let path = op.path
  const q = new URLSearchParams()
  const headers = new Headers()
  for (const p of op.parameters) {
    if (
      [
        'authorization',
        'x-appfolio-developer-id',
        'x-appfolio-database-id',
        'idempotency-key',
      ].includes(p.name.toLowerCase())
    )
      continue
    const v =
      p.in === 'path'
        ? input.path?.[p.name]
        : p.in === 'query'
          ? input.query?.[p.name]
          : input.header?.[p.name]
    if (v === undefined) continue
    if (p.in === 'path')
      path = path.replace(`{${p.name}}`, encodeURIComponent(scalar(v)))
    else if (p.in === 'header') headers.set(p.name, scalar(v))
    else if (p.in === 'query') {
      if (
        p.style === 'deepObject' ||
        (v !== null && typeof v === 'object' && !Array.isArray(v))
      )
        appendDeep(q, p.name, v)
      else if (Array.isArray(v) && p.explode !== false)
        for (const item of v) q.append(p.name, scalar(item))
      else
        q.append(p.name, Array.isArray(v) ? v.map(scalar).join(',') : scalar(v))
    }
  }
  if (path.includes('{')) throw new AppError('missing_path_parameter')
  return {
    url: `https://api.appfolio.com/api/v0${path}${q.size ? '?' + q.toString() : ''}`,
    headers,
  }
}
export function serializeBody(op: Operation, input: ToolInput) {
  if (input.body === undefined)
    return { bytes: Buffer.alloc(0), contentType: '' }
  if (op.mediaType !== 'multipart/form-data')
    return {
      bytes: Buffer.from(JSON.stringify(input.body)),
      contentType: op.mediaType || 'application/json',
    }
  const body = object.parse(input.body)
  const boundary = `appfolio-${randomUUID()}`
  const parts: Buffer[] = []
  for (const [name, value] of Object.entries(body)) {
    if (!/^[^\r\n"\\]+$/.test(name))
      throw new AppError('invalid_multipart_name')
    const file = fileSchema.safeParse(value)
    if (file.success) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${file.data.filename}"\r\nContent-Type: ${file.data.mediaType}\r\n\r\n`,
        ),
        Buffer.from(file.data.base64, 'base64'),
        Buffer.from('\r\n'),
      )
    } else {
      if (name.toLowerCase() === 'file')
        throw new AppError('upload_bytes_required')
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${typeof value === 'object' ? JSON.stringify(value) : scalar(value)}\r\n`,
        ),
      )
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  const bytes = Buffer.concat(parts)
  if (bytes.length > 2_097_152) throw new AppError('upload_too_large', 413)
  return { bytes, contentType: `multipart/form-data; boundary=${boundary}` }
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + stableJson(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
export async function boundedResponse(response: Response, limit = 2_097_152) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.length
      if (size > limit)
        throw new AppError('upstream_response_too_large_narrow_query', 502)
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return Buffer.concat(chunks).toString('utf8')
}
