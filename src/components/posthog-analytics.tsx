import { useEffect } from 'react'
import posthog, { type PostHogConfig } from 'posthog-js'

// URL query strings can contain OAuth codes or other sensitive values.
function sanitizeProperties(properties: Record<string, unknown>) {
  for (const [key, value] of Object.entries(properties)) {
    // Session attribution is derived independently of save_campaign_params and
    // save_referrer. Keep only the entry page, stripping its query below.
    if (
      key.startsWith('$session_entry_') &&
      key !== '$session_entry_url' &&
      key !== '$session_entry_pathname'
    ) {
      delete properties[key]
      continue
    }
    if (
      (key.endsWith('url') || key.endsWith('referrer')) &&
      typeof value === 'string'
    ) {
      properties[key] = value.split(/[?#]/, 1)[0]
    }
  }
}

const options: Partial<PostHogConfig> = {
  defaults: '2026-08-30',
  capture_pageview: 'history_change',
  autocapture: false,
  disable_session_recording: true,
  person_profiles: 'identified_only',
  save_campaign_params: false,
  save_referrer: false,
  before_send: (event) => {
    if (event) {
      sanitizeProperties(event.properties)
      for (const key of ['$set', '$set_once'] as const) {
        for (const container of [event, event.properties]) {
          const properties = container[key]
          if (properties && typeof properties === 'object')
            sanitizeProperties(properties)
        }
      }
    }
    return event
  },
}

let initialized = false

export function PostHogAnalytics() {
  useEffect(() => {
    const key = import.meta.env.VITE_POSTHOG_KEY?.trim()
    if (!key || initialized) return

    posthog.init(key, {
      ...options,
      api_host:
        import.meta.env.VITE_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com',
    })
    initialized = true
  }, [])

  return null
}
