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

## Initial deployed preview evidence

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
CI passed on the initial application commit above. The later scope update was
subsequently deployed to the separate preview project described below.

The project pause blocks new Vercel builds, including the subsequent documentation
commit's automatic preview. Its Vercel check is intentionally blocked by the
platform pause; GitHub CI passes on all three Node versions. The pinned, tested
preview stays available. This is a release-policy gate, not a code-check failure.

## Default scope follow-up

Unauthenticated MCP requests previously advertised only `mcp:tools`, so Codex
needed an explicit `offline_access` scope to obtain refresh tokens. The server
now advertises both scopes from the same list used by the OAuth provider.
Tool calls still require only `mcp:tools`; consent controls offline access.

All 213 automated tests pass, including a regression test against the real auth
middleware. Build, types, lint, formatting and catalog checks pass. The built
server also passed the real-server read-only sequence against the isolated
Neon branch and designated AppFolio test connection. That run discovered scopes
from the unauthenticated challenge, registered without a scope override, issued
access and refresh tokens, read work orders, rotated tokens, and discovered all
181 tools using the renewed access token. Removal rejected old access and
refresh tokens. No AppFolio records were mutated in this follow-up.

The default-scope update is now deployed on the separate preview project below.

## Public preview for ChatGPT Desktop

At the owner's request, `appfolio-mcp-preview.vercel.app` now has an alias-specific
Deployment Protection Exception, created with the `alias-protection-override`
scope. This removes the Vercel cookie/login requirement for that hostname only.
The deployed build, auth policy, secrets and database configuration were not changed.

Without a Vercel cookie, the preview serves `/ping` and sign-in with HTTP 200,
serves both OAuth discovery documents, and returns application HTTP 401 for MCP
and private account requests. Discovery identifies the preview issuer, dynamic
client registration, S256 PKCE and authorization-code/refresh grants. Headless Chromium
passed signup, sign-in, connection creation, explicit selection, consent and the
state-preserving callback without a Vercel cookie. Connection validation used
only the designated AppFolio test environment; no AppFolio records were mutated.

Both production aliases still return HTTP 503 with `DEPLOYMENT_PAUSED`. The
underlying preview deployment URL still redirects to Vercel Authentication.
Reproduce the public-access checks with
`python3 scripts/verify-public-preview.py`. Actual ChatGPT Desktop authorization,
tool discovery, reads and renewal remain pending owner verification.

## Current preview deployment

Deployed commit: `913c336fb916dcc569064243021b8d3201920456`.
Project: `appfolio-mcp-preview`, `prj_YE82rvGwzErSdP5xEm2EzuAG68se`.
Deployment: `dpl_6MG4p8ZQ9jD3tBpB7skx161HDrdD`, target `staging`, state `READY`.
Canonical URL: https://appfolio-mcp-preview.vercel.app.

A manual staging request on the original project was blocked by its pause.
The new preview project uses the seven existing Preview-scoped variables,
with the same isolated database, auth secret, keyring and canonical origin.
No production configuration was copied or added. Automatic production domain
assignment is disabled. Vercel labelled the new project's first bootstrap build
`production`; it is protected, has no production application configuration and
does not own the canonical preview URL. The verified deployment above is the
subsequent explicit staging target. The original production project remains paused.

Without any Vercel cookie or client-supplied scope override, the real-server
script passed discovery of both default scopes, DCR registration defaults,
signup, private connection creation, explicit selection, consent, PKCE token
exchange, all 181 tools, a live work-order read, refresh rotation and discovery
using the refreshed token. Grant removal rejected existing access and refresh
tokens. Connection deletion and password checks passed. Headless Chromium also
passed accounts/passwords and browser OAuth through the state-preserving callback.
Only the designated AppFolio test connection was used; no AppFolio records were
mutated during this redeployment verification.

The public-access script passed on the new deployment, and both original
production aliases still returned `503 DEPLOYMENT_PAUSED`. GitHub CI passed all
three Node versions and 213 tests on the deployed commit. Actual client acceptance
is still pending the owner.
