// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appUrl } from './auth'

beforeEach(() => {
  for (const key of [
    'BETTER_AUTH_URL',
    'VERCEL_ENV',
    'VERCEL_BRANCH_URL',
    'VERCEL_URL',
  ])
    vi.stubEnv(key, undefined)
})
afterEach(() => vi.unstubAllEnvs())

it('uses the configured origin for local and production auth', () => {
  vi.stubEnv('BETTER_AUTH_URL', 'https://appfolio.example/')
  expect(appUrl()).toBe('https://appfolio.example')
})
it('uses a stable branch URL for an isolated PR preview', () => {
  vi.stubEnv('VERCEL_ENV', 'preview')
  vi.stubEnv('VERCEL_BRANCH_URL', 'appfolio-git-feature.vercel.app')
  vi.stubEnv('VERCEL_URL', 'appfolio-unique-deployment.vercel.app')
  expect(appUrl()).toBe('https://appfolio-git-feature.vercel.app')
})
it('falls back to the deployment URL for previews without a branch alias', () => {
  vi.stubEnv('VERCEL_ENV', 'preview')
  vi.stubEnv('VERCEL_URL', 'appfolio-unique-deployment.vercel.app')
  expect(appUrl()).toBe('https://appfolio-unique-deployment.vercel.app')
})
it('never derives the production issuer from a preview or deployment URL', () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_BRANCH_URL', 'appfolio-git-main.vercel.app')
  vi.stubEnv('VERCEL_URL', 'appfolio-unique-deployment.vercel.app')
  expect(appUrl).toThrow('BETTER_AUTH_URL must be configured')
})
