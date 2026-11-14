# Delivery plan and decisions

Status: implementation in progress. The brief remains the acceptance contract.
No live AppFolio mutations are permitted until the owner designates the test database.
Production launch requires the owner's acceptance and the brief's verification.

## Architecture

One TanStack Start application runs on Vercel. Better Auth owns accounts, browser
sessions, OAuth discovery, registration, PKCE, signed authorization requests,
codes, JWT signing, and refresh rotation. The official MCP SDK owns Streamable
HTTP. AppFolio credentials are never OAuth client-registration credentials.

An account owns many connections. Each authorization gets a new immutable grant
ID, used as the provider's consent reference and a signed access-token claim.
Selection is stored against the signed authorization request and browser session,
not a user-wide active connection. Every issuance and tool call checks the grant
and connection in PostgreSQL. Revoked grant tombstones are retained. Removal and
connection deletion fail closed across instances, including tokens minted in a
race with removal. Provider token state is retained only by Better Auth.

Use PostgreSQL transactions through Neon's WebSocket pool and Drizzle's neon-serverless adapter rather
than Neon HTTP for lifecycle changes. This supports row locks and atomic changes
across connections, grants, and provider records. Upstream token acquisition uses
short database leases with fencing by credential version; no transaction stays
open across upstream network calls. No process-local synchronization is trusted.

An alternative, storing an active connection in the browser session, would mix
parallel authorizations. Binding by user/client would also mix independent grants.
Both are rejected. An independent OAuth implementation is rejected in favor of
provider-maintained protocol and token state.

## Modules and boundaries

- `src/server/auth`: Better Auth configuration and signed-flow request context.
- `src/server/connections`: encrypted credentials, ownership, updates, deletion.
- `src/server/grants`: immutable binding, selection, revocation.
- `src/appfolio`: generated operation catalog, serialization, upstream adapter.
- `src/server/logging`: allowlisted structured application records and flushing.
- `src/routes`: browser pages, account API, provider discovery, MCP, `/ping`.

The OpenAPI file stays unchanged. A reproducible generator converts its schemas
to JSON Schema, produces tools named by operationId, and records all operations.
The adapter explicitly overrides legacy Basic auth with OAuth client credentials.
Work-order filters require Id or LastUpdatedAtFrom. No fallback authentication.

## Policies

- Public email/password signup. No email verification or password recovery.
- Passwords: 12–128 characters. Current-password verification through Better Auth.
  Password changes revoke other browser sessions, retain the current session,
  and leave MCP grants and AppFolio credentials independent.
- MCP access tokens: 15 minutes. Rotating refresh tokens: 30-day sliding window.
  `offline_access` is required for renewal. No promise of permanent access.
- Require `mcp:tools` and resource-bound access tokens of type `at+jwt`.
- CIMD profile 2026-07-28 plus explicit DCR for older target clients. Actual
  compatible client versions and protocol revisions require observed tests.
- Uploads carry base64 bytes, filename, and media type, never a local path or URL.
  Bounded request/response sizes, one page per call, no unbounded job polling.
- Persist exact mutation bytes and idempotency identity per user/grant/connection.
  Do not automatically retry mutations or DELETE. Return ambiguous outcomes with
  the original key and a recovery instruction. Key lifetime is 24 hours upstream.
- AES-256-GCM envelopes bind ciphertext to connection ID and purpose. Versioned
  keys are server-only configuration. Owner must preserve keys for recovery.
- PostHog US project 735105 receives server logs. Export is optional locally,
  required and observed for deployment acceptance. No bodies or credential values.

## Milestones

1. Architecture, versions, catalog and contract verification.
2. Accounts, connection lifecycle, encryption and independent token acquisition.
3. OAuth selection, issuance, immutable bindings and revocation.
4. Work orders, logging and dependency-free `/ping`.
5. All operations, uploads, bulk, jobs, idempotency and failure verification.
6. Isolated Neon integration tests and Vercel preview acceptance.
7. Owner's manual Cursor, Claude Code and Codex checks; production acceptance.

## Access and open verification

- GitHub access confirmed.
- Neon production branch: br-aged-bread-bf42fykn. Isolated implementation branch:
  br-bitter-water-bfiixu0l. Never use production for automated database tests.
- Vercel team requires connector team-access consent before configuration.
- AppFolio credentials, designated database, records and allowed mutations pending.
- Client tests will be performed by the owner.
- Local Intent command is absent. It was checked; no replacement was downloaded.

Track actual evidence separately from planned behavior. Passing a catalog count,
compilation, mocks, or browser login alone does not establish live compatibility.

## Verified package choices

Better Auth, MCP and CIMD packages are pinned together at 1.7.23. The official
MCP server SDK is 2.4.0. PostHog Node is 5.71.0 in the lockfile. The existing
TanStack/React/Vite versions are retained. Nitro 3.0.261103-rc is pinned because
Vercel's current documented TanStack integration uses the Nitro 3 Vite plugin;
the Vite 8 adapter is not available in the older Nitro stable major. This is a
specific deployment compatibility exception to the stable-package preference.
The existing Drizzle ORM/Kit 1.0.0-rc.5 pair is retained to avoid an unrelated ORM
migration. The frozen lockfile and final build/type/CI checks establish this
combination; live target-client acceptance remains a separate gate.
