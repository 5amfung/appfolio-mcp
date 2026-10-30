import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostHogConfig } from 'posthog-js'

const { init } = vi.hoisted(() => ({ init: vi.fn() }))
vi.mock('posthog-js', () => ({ default: { init } }))

describe('PostHog analytics', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('does not initialize during server rendering', async () => {
    const { PostHogAnalytics } = await import('./posthog-analytics')
    expect(renderToString(<PostHogAnalytics />)).toBe('')
    expect(init).not.toHaveBeenCalled()
  })

  it('does not initialize without a project token', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '  ')
    const { PostHogAnalytics } = await import('./posthog-analytics')
    render(<PostHogAnalytics />)
    expect(init).not.toHaveBeenCalled()
  })

  it('initializes once across StrictMode effects and remounts', async () => {
    const { PostHogAnalytics } = await import('./posthog-analytics')
    const view = render(
      <StrictMode>
        <PostHogAnalytics />
      </StrictMode>,
    )
    view.unmount()
    render(<PostHogAnalytics />)

    expect(init).toHaveBeenCalledExactlyOnceWith(
      'phc_test',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        capture_pageview: 'history_change',
        autocapture: false,
        disable_session_recording: true,
      }),
    )
  })

  it('defaults to the US ingestion host', async () => {
    vi.stubEnv('VITE_POSTHOG_HOST', '')
    const { PostHogAnalytics } = await import('./posthog-analytics')
    render(<PostHogAnalytics />)
    expect(init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        api_host: 'https://us.i.posthog.com',
      }),
    )
  })

  it('strips query strings and fragments from current and initial URLs', async () => {
    const { PostHogAnalytics } = await import('./posthog-analytics')
    render(<PostHogAnalytics />)
    const config = init.mock.calls[0][1] as Partial<PostHogConfig>
    const beforeSend = config.before_send
    if (typeof beforeSend !== 'function')
      throw new Error('Expected a before_send hook')
    const event = {
      uuid: 'test-event',
      event: '$pageview',
      $set_once: {
        $initial_current_url: 'https://app.example.com/?code=secret',
      },
      properties: {
        $current_url: 'https://app.example.com/mcp-demo?code=secret#token',
        $referrer: 'https://example.com/?email=private',
        $session_entry_url: 'https://app.example.com/?code=secret',
        $set_once: {
          $initial_current_url: 'https://app.example.com/?code=secret',
        },
        $pathname: '/mcp-demo',
      },
    }
    beforeSend(event)
    expect(event.$set_once).toEqual({
      $initial_current_url: 'https://app.example.com/',
    })
    expect(event.properties).toEqual({
      $current_url: 'https://app.example.com/mcp-demo',
      $referrer: 'https://example.com/',
      $session_entry_url: 'https://app.example.com/',
      $set_once: { $initial_current_url: 'https://app.example.com/' },
      $pathname: '/mcp-demo',
    })
  })
})
