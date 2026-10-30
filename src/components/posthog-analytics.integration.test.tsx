import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import posthog from 'posthog-js'
import { PostHogAnalytics } from './posthog-analytics'

afterEach(async () => {
  await posthog.shutdown()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

it('removes SDK-derived campaign and referrer attribution from captured events', () => {
  vi.useFakeTimers()
  vi.stubEnv('VITE_POSTHOG_KEY', 'phc_integration_test')
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://us.i.posthog.com')
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(
    {},
    '',
    '/mcp-demo?utm_source=private-email&utm_campaign=secret#private-fragment',
  )
  vi.spyOn(document, 'referrer', 'get').mockReturnValue(
    'https://private-referrer.example.com/?code=private-code',
  )
  // Keep real SDK enrichment and before_send processing; intercept only transport.
  vi.spyOn(posthog, '_send_request').mockImplementation(() => {})

  render(<PostHogAnalytics />)
  const event = posthog.capture('privacy_regression')
  expect(event).toBeDefined()
  if (!event) throw new Error('Expected an event from the real PostHog SDK')

  expect(event.properties.$pathname).toBe('/mcp-demo')
  expect(event.properties.$current_url).toBe(
    `${window.location.origin}/mcp-demo`,
  )
  expect(event.properties).not.toHaveProperty('$session_entry_utm_source')
  expect(event.properties).not.toHaveProperty('$session_entry_utm_campaign')
  expect(event.properties).not.toHaveProperty('$session_entry_referrer')
  expect(JSON.stringify(event)).not.toMatch(
    /private-email|secret|private-fragment|private-referrer|private-code/,
  )
})
