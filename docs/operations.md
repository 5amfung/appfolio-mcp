# Operations reference

## Environments

| Variable                                | Purpose                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`                          | Isolated Neon database for the deployment; server-only                        |
| `BETTER_AUTH_URL`                       | Stable canonical website origin; resource and issuer derive from it           |
| `BETTER_AUTH_SECRET`                    | Provider encryption/signature secret, different per environment               |
| `CREDENTIAL_KEYS`                       | JSON map of key ID to 64 hexadecimal characters; never public                 |
| `CREDENTIAL_KEY_ID`                     | Key used for new ciphertext; old IDs remain decryptable                       |
| `POSTHOG_PROJECT_TOKEN`                 | Server-side project ingestion token; no personal API key                      |
| `POSTHOG_HOST`                          | US ingestion host `https://us.i.posthog.com`                                  |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | Optional existing browser analytics, independent of logs                      |
| `APPFOLIO_TEST_*`                       | Four designated upstream test credentials for explicit live verification only |

No values belong in source control, screenshots, reports or PR descriptions.
Production must not inherit test credentials or the preview database/keyring.
The canonical preview origin is `https://appfolio-mcp-preview.vercel.app`.
The final production origin must be established before issuing production grants.
Changing the origin changes issuer/audience and requires client reauthorization.

## Encryption and recovery

Every encrypted envelope records its key ID, random IV, authentication tag and
ciphertext. Associated data includes the connection ID and value purpose.
Database backups alone cannot recover encrypted credentials or retry bodies.
The owner must retain a separate secure backup of every keyring version and the
Better Auth secret. Loss of the keyring requires users to replace credentials;
loss of provider secrets can invalidate sessions and authorizations.

To replace an encryption key, add a new key ID while retaining old keys, deploy,
and change `CREDENTIAL_KEY_ID`. Existing data remains readable. Re-saving a
connection encrypts its credentials with the active key; reacquisition encrypts
its cached token. Do not remove an old key until all dependent ciphertext and
required backups have been migrated or retired. This release does not automate
bulk re-encryption. Keep revoked grant tombstones so old tokens cannot revive.

## PostHog Logs

Service name: `appfolio-mcp`. Project: [735105](https://us.posthog.com/project/735105/logs).
Integration: native `posthog-node` logs API, version pinned in the lockfile.
Structured records include environment, severity, operation, outcome, correlation
ID, duration, sanitized error category, and applicable upstream status/retry data.
The helper copies an allowlist of fields; it never exports request or response
bodies, exception details, credentials, cookies, auth codes, tokens or raw URLs.

The helper flushes on request completion, including errors, and registers export
work with Vercel's `waitUntil`. It reuses the client without per-request shutdown.
SDK buffering, export budgets and retry limits bound delivery. Export failure
cannot replace a successful response or the original application error. Logs can
be dropped during outages, rate caps or process termination. They are not a
permanent audit trail. Production debug output is disabled.

Local ingestion has been observed. Deployment acceptance additionally requires
preview records for success, failure, grant removal and connection deletion,
including cold starts and failure isolation. Query by `service.name`, environment
and `correlation_id`. If no records appear, verify the server-side token/host,
then inspect sanitized delivery diagnostics and Vercel infrastructure logs.
Browser pageviews do not establish server delivery.

At inspection, project `logs_settings` was null. No project override was configured. PostHog documents a 14-day default in
[Logs pricing](https://posthog.com/docs/logs/pricing#retention). Per-service or
source overrides must be checked before relying on a longer retention period;
no paid custom retention was enabled.
Application code does not intentionally sample records. Platform-generated logs
are separate: Vercel can record request paths/query metadata for OAuth routes.
Do not enable request-body/header logging. Keep access restricted and avoid raw
callback URL copies in diagnostics. Application redaction cannot retroactively
redact infrastructure logs.

## Release and rollback

Run migrations on an isolated Neon branch first. Review provider schema and
application migration SQL. Apply additive migrations before deploying the code
that uses them. Build and verify a preview. Require GitHub checks and resolve
blocking review findings. The owner performs the three client acceptance flows
and decides when production may launch.

Stage production with its own secrets and database, verify the exact deployment,
then assign production traffic. Do not promote a preview built with preview
secrets as though it had been verified with production configuration.

Rollback application traffic to the previous tested Vercel deployment. Do not
undo database migrations automatically. Additive tables and columns permit old
code to run; inspect compatibility before any destructive schema rollback.
`/ping` must return HTTP 200 and `Cache-Control: no-store` without dependency
access. It is not a database or upstream readiness probe.

## Upstream recovery

Token acquisition uses per-connection leases and credential-version fences in
Postgres. Expired leases recover after a crashed process. A stale acquisition
cannot undo a replacement or deletion. No transaction spans upstream HTTP.
An acquisition failure blocks business calls and preserves saved credentials.
Replace the connection's secret manually when AppFolio revokes it.

For ambiguous writes, inspect upstream state before initiating a new operation.
Reuse the returned caller idempotency key with unchanged input when a replay is
appropriate within 24 hours. Do not blindly retry DELETE or authentication
failures. Narrow queries when a response exceeds bounds. Poll recorded jobs only
at the indicated rate and retrieve results within seven days.
