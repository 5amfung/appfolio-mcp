// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest'
const exporter = vi.hoisted(() => ({
  captureLog: vi.fn(),
  flush: vi.fn(async () => {}),
}))
vi.mock('posthog-node', () => ({
  PostHog: class {
    captureLog = exporter.captureLog
    flush = exporter.flush
  },
}))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.resetModules()
})
it('exports only allowlisted fields and never runtime extras', async () => {
  vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'test')
  vi.stubEnv('POSTHOG_HOST', 'https://us.i.posthog.com')
  const { log, flushLogs } = await import('./logging')
  const record = {
    operation: 'test',
    outcome: 'success' as const,
    correlation_id: 'id',
    duration_ms: 1,
    clientSecret: 'must-not-export',
    body: { password: 'private' },
    authorization: 'Bearer private',
  }
  log(record)
  await flushLogs()
  expect(exporter.captureLog).toHaveBeenCalledOnce()
  expect(JSON.stringify(exporter.captureLog.mock.calls)).not.toMatch(
    /private|must-not-export|password|authorization/,
  )
  expect(exporter.flush).toHaveBeenCalledOnce()
})
it('isolates emission and flush failures', async () => {
  vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'test')
  vi.stubEnv('POSTHOG_HOST', 'https://us.i.posthog.com')
  exporter.captureLog.mockImplementationOnce(() => {
    throw new Error('exporter unavailable')
  })
  exporter.flush.mockRejectedValueOnce(new Error('exporter unavailable'))
  const { log, flushLogs } = await import('./logging')
  expect(() =>
    log({
      operation: 'test',
      outcome: 'failure',
      correlation_id: 'id',
      duration_ms: 1,
    }),
  ).not.toThrow()
  await expect(flushLogs()).resolves.toBeUndefined()
})
it('works without ingestion configuration', async () => {
  vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')
  const { log } = await import('./logging')
  log({
    operation: 'test',
    outcome: 'success',
    correlation_id: 'id',
    duration_ms: 1,
  })
  expect(exporter.captureLog).not.toHaveBeenCalled()
})
