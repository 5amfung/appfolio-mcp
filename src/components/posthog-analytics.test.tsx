import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostHogConfig } from 'posthog-js'

const init = vi.fn<(key: string, config: Partial<PostHogConfig>) => void>()
const load = vi.fn()

describe('PostHog analytics', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('posthog-js', () => {
      load()
      return { default: { init } }
    })
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('does not initialize during server rendering', async () => {
    const { PostHogAnalytics } = await import('./posthog-analytics')
    expect(renderToString(<PostHogAnalytics />)).toBe('')
    expect(load).not.toHaveBeenCalled()
    expect(init).not.toHaveBeenCalled()
  })

  it('does not initialize without a project token', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '  ')
    const { PostHogAnalytics } = await import('./posthog-analytics')
    render(<PostHogAnalytics />)
    await vi.dynamicImportSettled()
    expect(load).not.toHaveBeenCalled()
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

    await waitFor(() =>
      expect(init).toHaveBeenCalledExactlyOnceWith(
        'phc_test',
        expect.objectContaining({
          api_host: 'https://eu.i.posthog.com',
          capture_pageview: 'history_change',
          autocapture: false,
          disable_session_recording: true,
        }),
      ),
    )
    expect(load).toHaveBeenCalledOnce()
  })

  it('defaults to the US ingestion host', async () => {
    vi.stubEnv('VITE_POSTHOG_HOST', '')
    const { PostHogAnalytics } = await import('./posthog-analytics')
    render(<PostHogAnalytics />)
    await waitFor(() =>
      expect(init).toHaveBeenCalledWith(
        'phc_test',
        expect.objectContaining({
          api_host: 'https://us.i.posthog.com',
        }),
      ),
    )
  })

  it('keeps the application usable when the SDK cannot load', async () => {
    vi.doMock('posthog-js', () => {
      load()
      throw new Error('SDK unavailable')
    })
    const { PostHogAnalytics } = await import('./posthog-analytics')
    render(
      <>
        <PostHogAnalytics />
        <button>Sign in</button>
      </>,
    )
    await vi.dynamicImportSettled()
    expect(load).toHaveBeenCalledOnce()
    expect(init).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('allows a later mount to retry failed initialization', async () => {
    init.mockImplementationOnce(() => {
      throw new Error('Initialization failed')
    })
    const { PostHogAnalytics } = await import('./posthog-analytics')
    const view = render(<PostHogAnalytics />)
    await vi.dynamicImportSettled()
    expect(init).toHaveBeenCalledOnce()
    view.unmount()
    render(<PostHogAnalytics />)
    await waitFor(() => expect(init).toHaveBeenCalledTimes(2))
  })

  it('strips query strings and fragments from current and initial URLs', async () => {
    const { PostHogAnalytics } = await import('./posthog-analytics')
    render(<PostHogAnalytics />)
    await waitFor(() => expect(init).toHaveBeenCalledOnce())
    const config = init.mock.calls[0][1]
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
