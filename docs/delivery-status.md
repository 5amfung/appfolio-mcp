# Delivery status

Application implementation and automated preview verification are ready for
owner acceptance. Production is paused and must remain so until launch approval.

- PR: https://github.com/5amfung/appfolio-mcp/pull/15, open pending acceptance.
- Tool-documentation fix: https://github.com/5amfung/appfolio-mcp/pull/16,
  targeting the implementation branch.
- Deployed branch: `fix/self-describing-mcp-tools`.
- Deployed code commit: `0116fb17662586250108d8ec98a68b191a59e5aa`.
- Tested preview deployment: `dpl_8zUgpR7Ep6SRACnSv5oU58rwmUfD`, target `staging`.
- Preview project: `appfolio-mcp-preview`, `prj_YE82rvGwzErSdP5xEm2EzuAG68se`.
- Paused production project: `appfolio-mcp`, `prj_oYPjnMTgWJveoQesbkD92RaYPBiN`.
- Canonical preview: https://appfolio-mcp-preview.vercel.app.
- Preview Neon branch: `br-bitter-water-bfiixu0l`.
- Provisioned production branch remains `br-aged-bread-bf42fykn`; no migrations
  or test mutations were run there. Production secrets are not configured.
- All 181 operations have tools, input/response schemas and contract fixtures.
- 223 tests, build, types, lint, formatting, catalog freshness and the three-node
  GitHub CI matrix pass on the deployed commit.
- Real deployed account, OAuth, tool discovery, read/write/replay/read-back,
  refresh, revocation, deletion and password flows passed on the earlier
  implementation preview, before the documentation-only update.
- Deployed browser account and OAuth flows passed in headless Chromium on that
  earlier build; they were not repeated for this update.
- PostHog preview success, removal, rejection, deletion and write records were
  observed on the earlier build. Vercel error/fatal scan was empty for that build.

The current update preserves nested input descriptions and valid examples across
all 181 operations, including filters, composed request bodies, pagination,
uploads and retry keys. Real protocol-handler tests verify the published schemas;
a separate agent constructed representative calls using only those descriptors.
The live public-discovery/authentication-enforcement checks pass on the updated
canonical preview, and both production aliases remain paused. No AppFolio calls,
database migrations, or business-record mutations were made for this update.
Authenticated discovery in the owner's actual clients remains an acceptance step.

## Owner's next step

Run the [client acceptance checklist](client-acceptance.md) in Cursor, Claude Code
and Codex, plus the requested ChatGPT Desktop test. Record client versions and
results, especially complete catalog acceptance, separate connections, automatic
renewal and removal. The preview hostname is now publicly reachable through an
alias-specific Deployment Protection Exception. No `APPFOLIO_PREVIEW_COOKIE` or
Vercel login is needed. Remove old Cookie headers from client entries.
Application signup, connection selection and OAuth consent remain required.
Production is still paused; other deployment URLs remain protected.

## Resume after acceptance

1. Read this file, `verification.md`, PR checks and current review findings.
2. Resolve client compatibility or blocking review findings without weakening
   immutable bindings, revocation or credential isolation.
3. Keep CI passing; merge only when the acceptance/release gates permit it.
4. Configure separate production auth/encryption secrets and the final stable
   origin. Preserve an owner-accessible key backup. Apply reviewed migrations.
5. Stage and verify production with its own configuration. Obtain the owner's
   launch decision before unpausing/assigning production traffic.

The initial Git integration automatically created an unconfigured production
build. The owner explicitly approved pausing that production target; it is paused.
Automatic domain assignment is disabled. Do not treat the Vercel production label
as an accepted release. See `operations.md` for recovery and rollback.

Live evidence covers representative reads and writes. Uploads, bulk, async and
remaining operations have contract-level fixtures; per-operation live coverage
is not claimed. Actual deployed exporter-outage injection and cross-instance race
injection remain unverified, with automated failure/coordination tests in place.
No proactive alerts were added. Test AppFolio inventory locations remain because
the contract has no deletion endpoint for them. Isolated verification accounts
and their application/provider credentials were cleaned up after tests.

## Current deployment-check state

The owner-approved pause blocks new builds on the production project, including
preview targets. A separate preview project now hosts the tested build above.
The canonical preview alias was moved there, retaining its public-access exception.
Only the existing preview configuration was copied, scoped to Preview. The origin,
isolated Neon branch, auth secret and keyring are unchanged. The original project
remains paused; neither production configuration nor production traffic was changed.

The deployed scope update advertises `mcp:tools` and `offline_access` by default.
Codex needs no scopes setting. Without a Vercel cookie, the new deployment passed
login, explicit connection selection, consent, PKCE, all 181 tools, a work-order
read, refresh, refreshed tool access and removal. Browser OAuth also passed.
Both production aliases still return `503 DEPLOYMENT_PAUSED`.

The original project's deployment checks can remain blocked by its pause. Do not
forge statuses or unpause it to clear those checks. Future previews should target
the preview project above. Obtain the owner's launch decision before restoring
production availability. See `verification.md` for deployment evidence.
