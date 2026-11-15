// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { isReleaseMerge, releaseEligible } from './check-release.mjs'

const { Response } = globalThis
const commit = 'a'.repeat(40)
function release() {
  return {
    merged_at: '2026-11-14T12:00:00Z',
    merge_commit_sha: commit,
    base: { ref: 'main', repo: { full_name: '5amfung/appfolio-mcp' } },
    head: {
      ref: 'release-please--branches--main--components--appfolio-mcp',
      repo: { full_name: '5amfung/appfolio-mcp' },
    },
    user: { login: 'github-actions[bot]' },
    labels: [{ name: 'autorelease: pending' }],
  }
}

it('allows the exact merge of a Release Please PR, before and after tagging', () => {
  expect(isReleaseMerge(release(), commit)).toBe(true)
  const tagged = release()
  tagged.labels = [{ name: 'autorelease: tagged' }]
  expect(isReleaseMerge(tagged, commit)).toBe(true)
})

it.each([
  ['ordinary merge', (p) => (p.head.ref = 'feature/new-tool')],
  ['unmerged release', (p) => (p.merged_at = null)],
  ['different merge commit', (p) => (p.merge_commit_sha = 'b'.repeat(40))],
  ['different base', (p) => (p.base.ref = 'develop')],
  ['fork', (p) => (p.head.repo.full_name = 'someone/appfolio-mcp')],
  ['unrecognized author', (p) => (p.user.login = 'someone')],
  ['missing release label', (p) => (p.labels = [])],
])('rejects a %s', (_, change) => {
  const pull = release()
  change(pull)
  expect(isReleaseMerge(pull, commit)).toBe(false)
})

it('queries public GitHub metadata without authentication', async () => {
  const request = vi.fn(async () => Response.json([release()]))
  await expect(
    releaseEligible({ branch: 'main', commit }, request),
  ).resolves.toBe(true)
  const [url, options] = request.mock.calls[0]
  expect(url).toContain(`/commits/${commit}/pulls`)
  expect(options.headers).not.toHaveProperty('Authorization')
})

it.each(['feature/work', '', undefined])(
  'rejects production from %s',
  async (branch) => {
    const request = vi.fn()
    expect(await releaseEligible({ branch, commit }, request)).toBe(false)
    expect(request).not.toHaveBeenCalled()
  },
)

it.each([
  ['API failure', async () => new Response('', { status: 503 })],
  [
    'network failure',
    async () => {
      throw new Error('offline')
    },
  ],
  ['malformed response', async () => Response.json({ message: 'unavailable' })],
  ['invalid JSON', async () => new Response('invalid')],
])('skips production on %s', async (_, request) => {
  expect(await releaseEligible({ branch: 'main', commit }, request)).toBe(false)
})

it.each([
  ['preview', 2, 1],
  ['production', 0, 1],
  ['production', 1, 0],
  ['production', 2, 0],
  ['production', undefined, 0],
])(
  'maps the %s checker exit %s to Vercel exit %s',
  (environment, code, expected) => {
    const directory = mkdtempSync(join(tmpdir(), 'appfolio-release-gate-'))
    try {
      if (code !== undefined)
        writeFileSync(join(directory, 'node'), `#!/bin/sh\nexit ${code}\n`, {
          mode: 0o700,
        })
      const { ignoreCommand } = JSON.parse(readFileSync('vercel.json', 'utf8'))
      const result = spawnSync('/bin/sh', ['-c', ignoreCommand], {
        env: { ...process.env, PATH: directory, VERCEL_ENV: environment },
      })
      expect(result.status).toBe(expected)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
