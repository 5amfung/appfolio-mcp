# Verification evidence

Implementation is in progress. This file records observed evidence rather than
assuming the brief is satisfied by compilation or an operation inventory.

## Observed

- Isolated Neon branch `br-bitter-water-bfiixu0l` created from the provisioned
  production branch. Provider and application migrations applied there only.
- AppFolio test OAuth returned HTTP 200, bearer type and numeric `expires_in=300`.
- All 181 generated tool inputs compile and construct trusted requests in the
  catalog test suite. All declared response schemas compile. Request fixtures
  cover the method/path mapping, filters and multipart transfer representation.
- PostgreSQL lifecycle tests pass for encrypted independent credential copies,
  ownership, immutable parallel selections, rename, secret-only update, identity
  change, invalid-update preservation, grant removal, deletion and stale writes.
- The built Nitro server passed the real-server script: signup/session,
  connection creation, secret-free settings, native DCR, explicit selection,
  signed consent, PKCE code exchange, all 181 tools discovered, live work-order
  retrieval, refresh rotation, removal, rejection of old access and refresh
  tokens, connection deletion and password confirmation/change.
- All 212 automated tests pass, including per-operation execution and upstream
  error fixtures, exact JSON/multipart retry bytes, async job grant isolation,
  polling bounds, shared token acquisition, and exporter-failure isolation.
- Headless Chromium passed signup, password mismatch feedback/change/field
  clearing, signout/signin, and OAuth login with no connections followed by
  connection creation, selection, consent and a state-preserving callback.
- `/ping` returned HTTP 200 and no-store from a built server started without
  database, auth URL/secret or credential-key configuration.
- PostHog project 735105 contains structured development records with service,
  environment, severity, correlation ID, operation and duration. Inspected records
  contain no credentials or bodies.

The live script defaults to reads only. With explicit `RUN_APPFOLIO_MUTATION_TESTS=1`,
it also creates, replays, updates and reads one named test inventory location
using only the supplied test connection. That sequence passed; the contract has
no delete operation for inventory locations, so the test record remains for inspection. Its account changes
are against the isolated application database. It creates verification accounts;
failed runs can leave test-only connections that the owner can remove later.

## Pending before acceptance

- Live upload, bulk and async checks in the designated test database where feasible.
  Those operations currently have contract-level success/error evidence.
- Actual deployed exporter-outage and cross-instance race injection remain
  unverified; the suite covers exporter failure and durable coordination semantics.
  Project has no log-retention override; documented default is 14 days.
- Manual client tests in Cursor, Claude Code and Codex.
- GitHub CI must remain passing on the final documentation/tooling commit.
- Owner's launch acceptance, separate production configuration and staged release.

## Reproduce

Run the checks in the README. Start the built server against the isolated database
and run `BASE_URL=http://localhost:3000 python3 scripts/verify-local.py` with the
four test variables present. The script prints labels and sanitized failures,
never credentials or business response bodies. It stores temporary agent tokens
in a mode-0600 file under `/tmp` to aid diagnostics; remove the file after use.

The Vite dev server returned an empty HTTP 400 for a streamed call immediately
following discovery. The same sequence succeeds on the built Nitro server.
Production-build and deployed tests are the acceptance evidence.

## Deployed preview evidence

Preview application build: `041b00553dff58eb4ddd6484eac070bbe6a9f6ac`.
Deployment: `dpl_FuTTBpuUeyAPLBp9BZMoZ2xCgq3x`.
Canonical URL: https://appfolio-mcp-preview.vercel.app.

The deployed server passed the full real-server read/write sequence: accounts,
private connection creation, secret-free settings, DCR, explicit selection,
signed consent, PKCE, all 181 tools, work-order read, idempotent inventory-location
creation/replay/update/read-back, refresh, removal, rejection of old access and
refresh, connection deletion, and password confirmation/change. Headless Chromium
also passed accounts/passwords and OAuth from login through connection creation,
selection, consent and callback against this deployed preview.

PostHog contains preview-labelled success, write, removal, rejected-grant and
connection-deletion records with correlation IDs, severity and duration. A Vercel
runtime error/fatal scan for this deployment returned no records. Application logs
were inspected separately in PostHog; no credentials or bodies were present.

GitHub CI passed all three Node versions: 22.22.2, 24.15.0 and 26. The 212-test
suite, build, lint, formatting, types and catalog checks passed. The final idempotency correction accepts printable keys up to 256 characters,
scopes caller keys by request path and exposes the upstream replay marker.
The preview additionally permits valid OAuth connections whose work-order probe
is permission-denied; actual operation permissions remain enforced upstream.

Automatic approval review initially rejected a persistent project-wide bypass
credential. The owner subsequently approved a temporary preview-specific access
link expiring after 23 hours. Production protection was unchanged. Explicit test
access was revoked after use; a fresh temporary client access file was prepared
privately for the owner's manual client tests. No access credential is committed.

Verification accounts, their provider sessions/tokens and their custom connection,
grant, job and retry records were removed from the isolated Neon branch. AppFolio
test inventory locations remain because the upstream contract has no delete
operation for that resource. No production database was mutated.

## Production gate

Vercel automatically marked its initial Git-connected feature-branch build as a
production target before an intentional production release. No production
application secrets or database were configured. Automatic production domain
assignment was disabled. Automatic approval review initially rejected pausing
that target; the owner then explicitly approved the pause and the pause API
succeeded. Production remains paused, protected and unaccepted. The preview is a
separate deployment. Do not unpause or release until the owner's client checks
and launch acceptance are complete.

The corrected preview was re-verified after the production pause. All deployed
server and browser checks passed, including the `Idempotent-Replayed` marker.
CI passed on the application commit above. Remaining PR-head changes are only
verification evidence and handoff documentation.
