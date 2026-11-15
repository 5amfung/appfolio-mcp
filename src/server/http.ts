import { AppError } from './errors'
export async function jsonBody(
  request: Request,
  limit = 32_768,
): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError('json_required', 415)
  const reader = request.body?.getReader()
  if (!reader) throw new AppError('body_required')
  let bytes = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const n = await reader.read()
      if (n.done) break
      bytes += n.value.length
      if (bytes > limit) throw new AppError('request_too_large', 413)
      chunks.push(n.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new AppError('invalid_json')
  }
}
export function privateJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
