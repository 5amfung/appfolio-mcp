import { PostHog } from 'posthog-node'
import { waitUntil } from '@vercel/functions'

// Never accept exceptions, request bodies, arbitrary attributes, URLs or credentials.
export type LogRecord = {
  operation: string
  outcome: 'success' | 'failure' | 'rejected'
  correlation_id: string
  duration_ms: number
  severity?: 'info' | 'warn' | 'error'
  error_category?: string
  upstream_status?: number
  retries?: number
  rate_limited?: boolean
  timeout?: boolean
}
let client: PostHog | undefined
export function log(record: LogRecord) {
  if (!process.env.POSTHOG_PROJECT_TOKEN || !process.env.POSTHOG_HOST) return
  try {
    client ??= new PostHog(process.env.POSTHOG_PROJECT_TOKEN, {
      host: process.env.POSTHOG_HOST,
      logs: {
        serviceName: 'appfolio-mcp',
        maxBufferSize: 100,
        maxBatchRecordsPerPost: 100,
        rateCap: { windowMs: 10_000, maxLogs: 1000 },
      },
      requestTimeout: 2_000,
      fetchRetryCount: 1,
      disableGeoip: true,
    })
    client.captureLog({
      body: record.operation,
      level: record.severity ?? 'info',
      attributes: {
        operation: record.operation,
        outcome: record.outcome,
        correlation_id: record.correlation_id,
        duration_ms: record.duration_ms,
        error_category: record.error_category,
        upstream_status: record.upstream_status,
        retries: record.retries,
        rate_limited: record.rate_limited,
        timeout: record.timeout,
        environment: process.env.VERCEL_ENV ?? 'development',
        timestamp: new Date().toISOString(),
      },
    })
  } catch {
    /* Telemetry cannot replace an application result. */
  }
}
export async function flushLogs() {
  try {
    await client?.flush()
  } catch {
    /* Isolate exporter failures. */
  }
}
export function finishLogs() {
  const flush = flushLogs()
  if (process.env.VERCEL) waitUntil(flush)
  return flush
}
