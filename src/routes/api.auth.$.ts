import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '@/server/auth'
import { oauthContext, requestHash } from '@/server/grants'
import { boundedResponse } from '@/appfolio/request'
import { privateJson } from '@/server/http'
import { AppError } from '@/server/errors'
import { log, finishLogs } from '@/server/logging'

function oauthQueryFromBody(body: string, contentType: string | null) {
  try {
    const parsed: unknown = contentType?.includes('json')
      ? JSON.parse(body)
      : Object.fromEntries(new URLSearchParams(body))
    if (
      parsed &&
      typeof parsed === 'object' &&
      'oauth_query' in parsed &&
      typeof parsed.oauth_query === 'string'
    )
      return parsed.oauth_query
  } catch {
    return undefined
  }
  return undefined
}

async function handler(request: Request) {
  const start = Date.now(),
    correlationId = crypto.randomUUID()
  try {
    let query = new URL(request.url).searchParams.toString()
    if (request.method === 'POST') {
      const body = await boundedResponse(
        new Response(request.clone().body),
        32_768,
      )
      if (body.length > 32_768)
        return new Response('Request too large', { status: 413 })
      query =
        oauthQueryFromBody(body, request.headers.get('content-type')) ?? query
    }
    const response = await oauthContext.run(
      { requestHash: requestHash(query) },
      () => getAuth().handler(request),
    )
    log({
      operation: 'authentication',
      outcome: response.ok ? 'success' : 'rejected',
      correlation_id: correlationId,
      duration_ms: Date.now() - start,
    })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch (error) {
    log({
      operation: 'authentication',
      outcome: 'failure',
      correlation_id: correlationId,
      duration_ms: Date.now() - start,
      severity: 'error',
      error_category: 'authentication_request_failed',
    })
    return privateJson(
      { error: 'authentication_request_failed', correlationId },
      error instanceof AppError ? error.status : 503,
    )
  } finally {
    await finishLogs()
  }
}
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
})
