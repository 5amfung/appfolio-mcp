# AppFolio MCP

An authenticated remote MCP server and account website built with TanStack Start,
Better Auth, the official MCP TypeScript SDK, Neon Postgres, Drizzle, Tailwind,
shadcn/ui, and Zod. The generated catalog contains all 181 operations in the
repository OpenAPI contract. AppFolio permissions constrain actual tool access.

Delivery is in progress. See [implementation decisions](docs/implementation-plan.md),
[contract overrides](docs/contract-overrides.md), and [verification](docs/verification.md)
for the distinction between implementation, automated evidence, and launch acceptance.

## Run locally

Use a supported Node.js version from `package.json` and its pinned pnpm version.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Configure a disposable Neon branch, an auth secret, the local canonical origin,
and a credential-encryption keyring. Use a different keyring and database for
production. Keep `.env` private. JSON keyrings must use single outer quotes in
`.env`, for example `CREDENTIAL_KEYS='{"v1":"<64 hex characters>"}'`.
Never put server secrets in variables prefixed with `VITE_`.

```sh
pnpm db:plan
pnpm db:apply
pnpm dev --host 0.0.0.0 --port 3000
```

The migration command applies Better Auth's current supported PostgreSQL schema
and the committed application migrations. It does not run during application
startup or builds. Review the plan and back up production before applying changes.
`docs/auth-schema.sql` records the initial provider schema for review.

For end-to-end verification use the built Nitro server, which is also the
production deployment artifact. The Vite development transport has shown an empty
400 response on a streamed MCP call immediately following tool discovery; that
sequence passes on the built server.

```sh
pnpm build
node --env-file=.env .output/server/index.mjs
```

The default server port is 3000. Set `PORT` and the matching `BETTER_AUTH_URL` when
using another port. Managed environments may require `NODE_USE_ENV_PROXY=1` for
Node HTTP calls. The Neon WebSocket pool honors the inherited HTTPS proxy.

## Account and connection behavior

Open `/` or `/settings` to sign up, sign in, manage connections, change your
password, and remove agent authorizations. Signup is public. Email verification
and password recovery are intentionally unavailable. Passwords require 12–128
characters. Better Auth owns hashing, current-password verification and sessions.
Password changes retain the current session, revoke other browser sessions, and
leave MCP grants and AppFolio credentials independent.

Each account can save multiple private AppFolio connections, including identical
credentials in independent records. Connection creation validates OAuth and a
minimal work-order read. Saved credentials and cached upstream tokens are
AES-256-GCM encrypted, bound to their connection and purpose, and never returned
to the browser. Renaming preserves identity. Replacing only the secret preserves
grants and invalidates the token cache. Changing client, database or developer ID
revokes existing grants. Deletion removes saved credentials and disables all bound
grants. Recreating a connection creates a new identity.

During agent authorization, sign in, select a connection, then grant consent.
Each authorization has an immutable connection binding. Separate authorizations
for the same agent may target different connections. Every tool call and token
issuance checks durable grant and connection state. Removal immediately disables
existing access tokens and refresh, across instances. Reauthorization creates a
new grant; it does not revive removed tokens.

## Connect a coding agent

Use the deployed canonical URL followed by `/api/mcp`. Configure it as remote
Streamable HTTP with OAuth. The resource is that exact MCP URL; the authorization
server issuer is the same origin followed by `/api/auth`.

The server supports CIMD with the 2026-07-28 profile and explicit dynamic client
registration for clients that use DCR. Native loopback callbacks are supported;
registrations without an application type infer native from their callback.
PKCE S256 is required. The MCP SDK serves the modern revision and stateless
2025-era Streamable HTTP without process-local sessions.

Request `mcp:tools offline_access`. Access tokens expire after 15 minutes. Refresh
tokens rotate and use a 30-day sliding expiry, with no reuse overlap. Invalid,
expired or removed grants require browser authorization again. AppFolio access
tokens renew separately from these agent tokens using upstream `expires_in`.

See [client acceptance](docs/client-acceptance.md) for setup references and the
manual checks required for Cursor, Claude Code and Codex. Client compatibility is
not established by browser login alone.

## Tools and writes

Tool names are the source `operationId`. Inputs group parameters under `path`,
`query`, `header`, and `body`. For example:

```json
{
  "query": {
    "filters": { "LastUpdatedAtFrom": "2026-11-01T00:00:00Z" },
    "page": { "size": 20, "number": 1 }
  }
}
```

Use that input with `getWorkOrders`. An unknown ID returns the upstream empty
data array. File fields accept filename, mediaType and base64 bytes. A remote
server cannot read a local agent file path. See the contract overrides for bounds,
retry keys, asynchronous jobs and deprecated operation behavior.

## Verify

```sh
python3 scripts/generate-appfolio-api-inventory.py --check
python3 scripts/generate-tools.py --check
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test:run
```

`pnpm build` generates router types before typecheck. Tests use real PostgreSQL
semantics through PGlite for lifecycle behavior and mock only upstream HTTP.
`python3 scripts/verify-local.py` exercises a running server, real isolated Neon
storage, OAuth and live AppFolio reads using the four `APPFOLIO_TEST_*` secrets.
It never mutates AppFolio. It creates local verification users and connections;
use an isolated application database. Never point it at production.

## Deploy and operate

Use the Vercel TanStack Start framework with Nitro and Node.js 24. Keep preview
and production databases, auth secrets, canonical URLs and encryption keys
separate. Preview configuration targets the isolated implementation database.
Builds require no secrets. `/ping` is unauthenticated, uncached and independent
of Neon and AppFolio; it checks application availability only. There is no
`/health` endpoint.

[Operations](docs/operations.md) covers environment variables, encryption-key
recovery, PostHog Logs, deployment verification and rollback. Application logs go
to US PostHog project 735105. Browser analytics remains optional and is not evidence
of server-log delivery. Debug logging and proactive alerts are not enabled.

GitHub CI checks formatting, lint, build, types and tests across the configured
Node.js matrix. Use Conventional Commits for merged changes. Release Please
maintains release metadata; the application is not published to npm.
