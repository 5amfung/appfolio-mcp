// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { handleMcp } from './mcp-server'

// Use the real auth provider with its in-memory adapter for discovery.
vi.mock('@/db/index.server', () => ({
  getPool: () => undefined,
  getDb: vi.fn(),
}))
afterEach(() => vi.unstubAllEnvs())

it('advertises tool access and refresh in the unauthenticated challenge', async () => {
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-for-mcp-scope-discovery-only')
  vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')

  const response = await handleMcp(new Request('http://localhost:3000/api/mcp'))

  expect(response.status).toBe(401)
  expect(response.headers.get('WWW-Authenticate')).toContain(
    'scope="mcp:tools offline_access"',
  )
})
