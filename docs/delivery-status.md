# Delivery status

Application implementation and automated preview verification are ready for
owner acceptance. Production is paused and must remain so until launch approval.

- PR: https://github.com/5amfung/appfolio-mcp/pull/15, open pending acceptance.
- Branch: `feat/authenticated-appfolio-mcp`.
- Application commit: `041b00553dff58eb4ddd6484eac070bbe6a9f6ac`.
- Tested preview deployment: `dpl_FuTTBpuUeyAPLBp9BZMoZ2xCgq3x`.
- Canonical preview: https://appfolio-mcp-preview.vercel.app.
- Preview Neon branch: `br-bitter-water-bfiixu0l`.
- Provisioned production branch remains `br-aged-bread-bf42fykn`; no migrations
  or test mutations were run there. Production secrets are not configured.
- All 181 operations have tools, input/response schemas and contract fixtures.
- 212 tests, build, types, lint, formatting, catalog freshness and the three-node
  GitHub CI matrix pass on the application commit.
- Real deployed account, OAuth, tool discovery, read/write/replay/read-back,
  refresh, revocation, deletion and password flows pass.
- Deployed browser account and OAuth flows pass in headless Chromium.
- PostHog preview success, removal, rejection, deletion and write records were
  observed. Vercel error/fatal scan was empty for the tested deployment.

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

The owner-approved project pause also blocks creation of new preview deployments.
Subsequent PR heads therefore have a blocked Vercel deployment check.
The stable preview alias remains pinned to the
successfully tested application deployment above, which remains accessible.
Do not forge a successful deployment status or unpause merely to clear this gate.
When resuming release preparation, account for this platform behavior and obtain
the owner's launch decision before restoring production availability.

The pending scope-discovery update makes `mcp:tools` and `offline_access` the
advertised defaults, removing the need for a Codex scopes setting. It passes
213 automated tests and the built-server login/read/refresh/removal sequence
using discovered scopes. It has not reached the pinned preview; that deployment
still needs an explicit Codex scopes setting until it is replaced. See
`verification.md` for the separate local and deployed evidence.
