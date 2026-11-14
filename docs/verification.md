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
- All 209 automated tests pass, including per-operation execution and upstream
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
- Deployed preview account/OAuth/read/write/renewal/removal checks and cold starts.
- PostHog deployed success/failure/removal/deletion records and cold-start delivery.
  Project has no configured logs override; documented default retention is 14 days.
  No paid custom retention or application sampling is enabled.
- Manual client tests in Cursor, Claude Code and Codex.
- Full build, lint, formatting, type, test and GitHub CI results on the final commit.
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

## Preview protection

Automatic approval review rejected creating an automation bypass credential as
persistent privileged access outside the explicitly approved security scope.
No bypass credential was created and infrastructure protection remains enabled.
Continue read-only deployment checks and owner browser verification. Full automated
preview flows require either explicit approval for that credential or a supported
existing authenticated test path; do not work around the rejection.
