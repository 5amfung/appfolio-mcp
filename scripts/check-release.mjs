import { pathToFileURL } from 'node:url'
import process from 'node:process'

const { fetch, AbortSignal } = globalThis

const repository = '5amfung/appfolio-mcp'
const releaseBranch = 'release-please--branches--main'
const releaseAuthors = new Set(['github-actions[bot]', '5amfung'])
const releaseLabels = new Set(['autorelease: pending', 'autorelease: tagged'])

export function isReleaseMerge(pull, commit) {
  return (
    pull?.merged_at != null &&
    pull.merge_commit_sha === commit &&
    pull.base?.ref === 'main' &&
    pull.base.repo?.full_name === repository &&
    pull.head?.repo?.full_name === repository &&
    (pull.head.ref === releaseBranch ||
      pull.head.ref?.startsWith(releaseBranch + '--components--')) &&
    releaseAuthors.has(pull.user?.login) &&
    Array.isArray(pull.labels) &&
    pull.labels.some((label) => releaseLabels.has(label?.name))
  )
}

export async function releaseEligible({ branch, commit }, request = fetch) {
  if (branch !== 'main' || !/^[a-f0-9]{40}$/.test(commit ?? '')) return false
  try {
    const response = await request(
      `https://api.github.com/repos/${repository}/commits/${commit}/pulls?per_page=100`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'appfolio-mcp-release-gate',
        },
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (!response.ok) return false
    const pulls = await response.json()
    return Array.isArray(pulls) && pulls.some((p) => isReleaseMerge(p, commit))
  } catch {
    return false
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const allowed = await releaseEligible({
    branch: process.env.VERCEL_GIT_COMMIT_REF,
    commit: process.env.VERCEL_GIT_COMMIT_SHA,
  })
  process.stdout.write(
    allowed
      ? 'Verified merged Release Please PR; production build allowed.\n'
      : 'Production build skipped: no verified Release Please merge.\n',
  )
  process.exitCode = allowed ? 0 : 1
}
