# AppFolio MCP server implementation brief

Build a public, authenticated MCP server that exposes every API operation in the repository's [OpenAPI document](../database-api-openapi.json) to Cursor, Claude Code, and Codex.

Prioritize account isolation, secure credentials, complete API coverage, and verified client compatibility. Use the OpenAPI document as the business API contract and the OAuth decision below as its explicit authentication override.

Confirmed on November 13, 2026: use AppFolio OAuth client credentials with automatic access-token renewal, include all API operations in version one, and allow multiple private AppFolio connections per user. Each MCP authorization binds to one connection selected during consent. Send structured application logs to PostHog Logs. See the [review](appfolio-mcp-review.md) for resolved findings and remaining implementation checks.

## Scope

Each user has one account in this service and can save multiple private AppFolio connections. Each connection has its own client ID, client secret, database ID, and developer ID. Different credential sets may have different upstream permissions, even for the same database. The same account supports two access paths:

- Website access uses email and password. A browser session protects account settings, AppFolio settings, and authorized-client management.
- Coding-agent access uses an OAuth authorization-code flow with PKCE. The user signs in through the browser, selects one of his connections, and grants consent for that connection. The agent receives MCP access and refresh tokens, never the user's password or AppFolio credentials.

Keep browser sessions, MCP authorizations, and AppFolio credentials independent. For each tool call, validate MCP access, confirm that the authorization remains active, and load only the connection bound to that authorization. Verify that the connection still belongs to the authenticated user. Do not use a user-wide default or last-used connection.

Users may independently save identical AppFolio credentials, including in separate connections owned by the same user. Do not share connection records, cached tokens, or authorization state between connections. A credential change or revocation at AppFolio may affect independently saved copies. Report upstream failures without changing another connection.

Version one includes all declared GET, POST, PATCH, DELETE, and PUT operations, including uploads, bulk operations, asynchronous operations, and deprecated operations still present in the contract. Preserve deprecation notices and document replacements. Organizations, invitations, shared connections, and an admin panel remain excluded. Notion, GitHub, Slack, and ElevenLabs are not upstream integrations. PostHog application logging is required. Proactive alerts remain deferred.

The current contract contains 181 operations across 161 paths: 68 GET, 66 POST, 36 PATCH, 6 DELETE, and 5 PUT. The generated [operation inventory](appfolio-api-inventory.md) records each method, path, and operation ID. Work-order retrieval can be the first integration milestone. Version one is complete only when every inventoried operation is supported.

## Stack and discovery

Use TypeScript, the official MCP TypeScript SDK, Better Auth, Neon Postgres, Drizzle, React with TanStack Start, Tailwind CSS, shadcn/ui, and Zod. Host one application on Vercel.

Inspect the existing scaffold before replacing components. Verify mutually compatible stable package versions and the required MCP protocol revisions. Document a concrete compatibility, security, or simplicity reason for any substitution.

Before implementation, record:

- Module boundaries, the one-user-to-many-connections schema, grant-to-connection binding, routes, and deployment configuration.
- Better Auth configuration for email/password accounts, sessions, password changes, MCP OAuth, and consent.
- MCP discovery, registration, callbacks, scopes, token lifetimes, renewal, and revocation.
- A compatibility checklist for each target client and execution environment.
- AppFolio OAuth configuration, credential validation, access-token expiration, and concurrency behavior.
- Complete operation-to-tool coverage, request serialization, uploads, asynchronous results, and write retry behavior.
- PostHog Logs integration, server-side configuration, redaction, delivery lifecycle, and deployed verification.
- Verification steps and any unavailable prerequisites.

Proceed on routine implementation decisions. Ask only when a missing contract, required secret, or material product decision blocks progress.

## AppFolio OAuth and automatic access-token renewal

Use AppFolio OAuth client credentials as described in the OpenAPI introduction:

- Exchange a client ID and client secret at `POST https://api.appfolio.com/oauth/token` with `grant_type=client_credentials`.
- Use `Authorization: Bearer <access_token>`, `X-AppFolio-Developer-ID`, and `X-AppFolio-Database-ID` for business API requests.
- Obtain another access token when needed. Calculate its expiration from the response's `expires_in`, rather than hard-coding a lifetime.

The document's machine-readable security definitions declare only legacy Basic auth. Override that declaration explicitly in the AppFolio authentication adapter and any client-generation configuration. Keep the supplied source unchanged and document the override. Do not fall back to Basic auth on an OAuth failure.

Accept OAuth-generated AppFolio credentials. Retain the saved client secret until manual replacement. Automatically obtain a new access token when needed. Verify the token response schema, error behavior, and granted upstream permissions during implementation. Tool availability does not grant permissions absent from the user's AppFolio credentials.

Store expiration for the access token, not the client secret. Automatic client-secret rotation is outside scope.

AppFolio token acquisition is separate from the agent's MCP OAuth flow. Neither operation requires the user to reauthorize the coding agent while its MCP grant remains valid.

## Website accounts

Use Better Auth's supported email/password authentication, password hashing, sessions, and password-change API. Do not store custom password hashes.

Provide sign-up, sign-in, sign-out, and protected pages for account settings, AppFolio settings, and authorized clients. Use secure session cookies and supported CSRF protection for browser mutations.

Account settings include current password, new password, and confirmation. Verify the current password and validate the new password on the server. Check confirmation on the server and provide immediate client feedback. Document the password policy and show clear success and failure messages.

Never place passwords in logs, URLs, analytics, or persisted form state. Clear password inputs after success. Changing the password for this service leaves AppFolio credentials unchanged.

Choose and verify password-change behavior for the current browser session, other browser sessions, and MCP authorizations. Keep those decisions separate. Identify production requirements for password recovery and email verification during design; neither feature is included automatically.

## MCP authorization

Use Better Auth's supported OAuth issuance and renewal mechanisms. Implement protected-resource and authorization-server discovery, a client registration strategy, authorization-code flow with PKCE, login, consent, and resource-bound access tokens.

Configure and document access-token and refresh-token lifetimes, inactivity behavior, scopes required for refresh, and refresh-token rotation policy. A valid refresh grant permits automatic access-token renewal. An expired, invalid, or revoked refresh grant requires a clear reauthorization path. Do not promise permanent access.

Browser cookies protect website routes. MCP requests carry access tokens. Validate the token's signature, issuer, audience, expiration, token type, and required scopes using the provider's supported mechanisms. Reject browser-session tokens and ID tokens presented as MCP access tokens.

Derive the user and authorization from the verified MCP token, then resolve the authorization's saved connection binding. Tool inputs, headers, and query parameters cannot override the user or connection. OAuth client registration identifies the coding agent and can be shared across users and grants. Any OAuth client secret belongs to that registration; the connection binding belongs to the individual user authorization and its access and refresh tokens. AppFolio client secrets remain server-side credentials of their respective connections.

Keep application request handling stateless. Add protocol state only when required by a verified transport or supported client revision. Persist OAuth grants and revocation records regardless of transport state.

### Connection selection and token binding

During browser authorization, show only the signed-in user's active connections, using a user-chosen name and masked identifying information. Require an explicit selection before consent and token issuance. If no connections exist, let the user create one through protected settings and resume the OAuth flow. Never issue an unbound grant or silently select an arbitrary connection.

Bind the selected connection to the pending authorization request using supported provider state or durable server-side metadata. Preserve PKCE, state, redirect, scope, and resource validation through login, connection selection, and consent. Recheck ownership and connection availability before issuing the authorization code and tokens so deletion or a forged selection cannot bypass validation.

Each grant has exactly one immutable connection binding. Access tokens, refresh tokens, and their rotated replacements resolve to that grant and connection. Renewal cannot change the binding. Selecting another connection requires a new authorization flow and a new grant. Never repoint an existing grant or make its old tokens access another connection.

Support separate grants for the same user and OAuth client on different connections. Do not identify grants solely by user and client ID, and do not overwrite a previous binding when another authorization completes. Test parallel browser flows for different connections. Record how each coding agent configures separate authorizations; do not assume every client stores multiple configurations the same way.

### Authorized clients and removal

List only the signed-in user's authorizations. Each entry shows the client display name, selected connection name, authorization date, and a Remove action. Distinguish separate authorizations for the same client on different connections. An entry represents an authorization grant, not a live connection. Do not display tokens or client secrets.

Use provider records where possible. Define how each grant maps to access and refresh tokens, including repeated authorizations from the same client. Bind tokens to an immutable grant identity or generation so a new authorization cannot make a removed grant's tokens valid again. An expired access token does not hide a grant that can still renew.

Removal must:

- Disable the selected user's authorization before returning success.
- Reject later requests carrying its existing access tokens.
- Invalidate its refresh tokens and prevent concurrent renewal from restoring access.
- Preserve other authorizations, including other grants on the same connection, and all AppFolio credentials.
- Require a new authorization flow to regain access.

Do not delete a global OAuth client registration. Removal does not undo an upstream operation already in progress.

Enforce active-grant checks through durable shared state across Vercel instances. A signature check, deleted consent record, revoked refresh token, or process-local cache alone does not meet immediate-revocation requirements. Fail closed when authorization state cannot be established.

## AppFolio connection storage and settings

Use a separate connection table with a stable connection ID and an owner foreign key. The owner is not unique: one user owns many connections. Ownership cannot transfer between users. Store each connection's four user-supplied credential values: client ID, encrypted client secret, database ID, and developer ID. Add a user-chosen connection name for selection and management, plus the metadata needed for validated updates and concurrency control. The name is a label, not a fifth credential.

Each MCP grant stores or references its authenticated user, OAuth client, and exactly one connection ID. Enforce that the grant's user owns the connection, using database constraints or equivalent transactional checks. Use provider authorization records and minimal binding metadata instead of duplicating the provider's token state.

Any persisted AppFolio access token is encrypted and has a backend-managed UTC expiration. Token caches, credential versions, and acquisition coordination are per connection, not per user, database ID, or OAuth client. An acquired token cannot overwrite a newer state for that connection or populate another connection's cache. Do not create a client-secret expiration field.

Use authenticated encryption for recoverable secrets. Keep encryption keys outside the database and document key management and recovery. Saved secrets never return to the browser or populate input fields. Show masked indicators and connection status.

Provide a protected connection list and allow a user to create, rename, edit, or explicitly delete only his own connections. Permit client-secret replacement without re-entering the other three credential values. Backend-managed expiration fields are read-only. Clearing visible inputs does not delete saved values. Show the connection associated with each authorization so differing upstream access levels remain understandable.

Validate a candidate update before replacing working credentials. Failed updates preserve the saved connection. Credential changes increment its version and invalidate its cached AppFolio token and expiration. Renaming a connection changes only its display label. Replacing only its client secret preserves its grant bindings; document that upstream permission changes affect those grants. Changing client ID, database ID, or developer ID revokes the connection's existing grants as part of the update and requires new authorization. Previously issued tokens cannot silently target a different upstream identity.

Deleting a connection immediately makes every bound grant unusable, rejects its existing access tokens, and prevents renewal. Use durable shared state and provider revocation mechanisms so concurrent issuance or renewal cannot restore access. Keep sufficient revoked-grant identity to reject old tokens. Other connections and their grants remain usable. Recreating a connection, even with the same name and credentials, creates a new identity and requires new authorization. Deletion removes credentials from this service without deleting the AppFolio account or revoking credentials upstream. Return a clear connection-unavailable and reauthorization path; never fall back to another connection.

Concurrent token acquisition must not recreate a deleted connection or overwrite a newer manual update.

## AppFolio authentication before a business call

Before each business API request:

1. Resolve the active grant's bound connection and verify that it exists and belongs to the authenticated user. Load that connection's credential version.
2. Reuse a valid access token. Acquire one when absent, expired, or within a configured safety window.
3. Validate the response and derive expiration from documented lifetime semantics.
4. Save any token state atomically, conditional on the connection still existing at the same credential version.
5. Call AppFolio using the valid token and the documented headers.

Use shared database coordination keyed by connection where the upstream operation requires it. A process-local lock cannot coordinate Vercel instances. After acquiring coordination, reread that connection and reuse another request's valid result for the same connection. Prevent stale writes after replacement or deletion. Never reuse a token from another connection, including one with the same database ID.

Failed acquisition or an invalid expiration blocks the business call and preserves valid saved credentials. Return a sanitized, actionable error. Handle timeouts and ambiguous outcomes according to the upstream contract. Do not assume a failed authentication response means expiration or enter an acquisition-and-retry loop.

Keep manual credential replacement available for recovery. AppFolio access-token renewal never changes the stored client secret.

## Tools

Expose every HTTP operation declared in the OpenAPI `paths` object. Use each `operationId` as its stable MCP tool name. Generate schemas and request construction where useful, then check descriptions, schema compatibility, and serialization. Authentication maintenance remains internal rather than an agent-callable business tool.

Maintain a coverage mapping from every method, path, and operation ID to its tool, input and output schemas, and verification evidence. Generate the source list with `python3 scripts/generate-appfolio-api-inventory.py`. Check inventory freshness with `python3 scripts/generate-appfolio-api-inventory.py --check`. An unimplemented or blocked operation remains an explicit gap; do not silently omit it. Update the mapping whenever the supplied contract changes.

Preserve documented path and query parameters, headers, request bodies, responses, status codes, and deprecations. Support JSON and multipart uploads, optional and nullable fields, bulk payloads, asynchronous job responses, and declared job-result retrieval. Avoid recursive polling beyond a bounded request deadline. Document contract inconsistencies and implement explicit, tested overrides. Do not invent endpoints or silently narrow supported operations.

For `getWorkOrders`, the `filters` parameter is optional in the schema, but its prose requires `Id` or `LastUpdatedAtFrom`. Require at least one and serialize the documented `filters[Id]` or `filters[LastUpdatedAtFrom]` query. Support the remaining documented filters and pagination. Define empty-result behavior for ID lookup.

Tool inputs cannot supply credentials, a connection override, arbitrary upstream URLs, or authentication-header overrides. Route every business call through shared grant-binding, ownership, and authentication checks. MCP tokens cannot enumerate or manage the user's other saved connections. The selected connection's AppFolio permissions constrain actual access to the full tool catalog.

Define bounded pagination, response-size limits, upload-size limits, timeouts, and retry budgets. Choose an upload representation compatible with all target MCP clients. Keep file transfer and pagination within trusted AppFolio destinations and Vercel request limits. Mark read, write, destructive, and idempotent tool behavior accurately. Tool annotations describe behavior; server-side checks enforce access.

For POST, PATCH, and PUT, support the contract's `Idempotency-Key` header. Validate keys and reuse the same key and byte-identical body for retries of one logical operation, including multipart requests. Generate a key when absent, return it in sanitized tool metadata, and accept a caller-supplied key for retries across separate tool calls. Prevent token renewal or request reconstruction from creating a new key or payload for a retry. Follow the documented key lifetime and replay, conflict, and payload-mismatch behavior.

Associate pending operations, retry records, upload handles, and asynchronous job context with the authorized user, grant, and bound connection. Check that binding when resuming work. A caller-supplied key or handle cannot select another connection's stored operation. Prevent independent connections from sharing retry identity accidentally, including when their credentials target the same upstream database.

The contract ignores idempotency keys on GET and DELETE. Do not infer DELETE retry safety from the header. Respect `Retry-After`, distinguish confirmed failures from ambiguous write outcomes, and return an actionable result when safe recovery cannot be established. Do not blindly retry a mutation after an upstream authentication failure.

## Client compatibility and deployment

Prefer one standards-based configuration. Add client-specific behavior only when documentation or observed tests require it.

For Cursor, Claude Code, and Codex, record transport, protocol revision, discovery, registration method, callback rules, scopes, connection selection, separate configurations for different connections, renewal, revocation, and reauthentication. Verify callback URLs against current official documentation. Target local interactive clients first. Record hosted and headless behavior separately.

Verify the full sequence for each client: browser authorization, tool discovery, authenticated read and write calls, automatic token renewal, and rejection after removal. Check that the full operation catalog is discoverable and its schemas are accepted. Browser login alone is insufficient evidence.

Use stable production OAuth URLs and separate preview and production configuration. Verify TanStack Start deployment, streaming and function duration limits, database connection management, and server-side configuration. Persist credentials, grants, and coordination state outside process memory and local files.

Justify adapters or additional infrastructure against verified constraints. Confirm deployed behavior, rather than assuming local tests establish Vercel compatibility.

## Logging and availability

Send structured application logs to PostHog Logs through one lightweight logging helper. Record authentication, connection selection, renewal, removal, rejected grants, tool execution, database failures, AppFolio failures, and authentication maintenance. Use a supported server-side Node.js logging integration, selecting the native PostHog logging API or an OTLP exporter to fit the deployed runtime and existing logger. Record the chosen integration and compatible versions. Existing browser analytics does not establish server-log delivery.

Configure the target PostHog project, region or ingestion endpoint, and project token through server-side environment variables. Document variable names without values and separate production from preview configuration. Builds and local startup must work without ingestion configuration; deployed acceptance requires configured, observed delivery to PostHog. Proactive alerts remain deferred.

Include service name, deployment environment, timestamp, severity, correlation ID, operation, outcome, duration, sanitized error category, upstream status, retries, rate limits, and timeouts as structured, searchable fields. Include internal user, grant, or connection identifiers only when needed. Correlate the MCP request with database and upstream operations. Distinguish expected authentication challenges from unexpected failures. Log tool failures even when transport status is HTTP 200.

Redact before logging or export. Never log passwords, the four AppFolio connection values, decrypted credentials, tokens, authorization codes, session cookies, authorization headers, database URLs, PostHog ingestion credentials, sensitive bodies, or unfiltered OAuth callback URLs. Apply the same redaction to exception details and any local output. Check application and platform-generated logs separately. Avoid secrets in URLs and document platform limitations. Vercel infrastructure logs remain available for platform diagnostics; application-log verification takes place in PostHog.

Disable production debug logging by default. Use bounded buffering, export timeouts, and retry limits. Integrate flushing with the supported Vercel request lifecycle, including application-error paths, so delivery does not depend only on a background timer after the function returns. Do not shut down a shared logger after every invocation. Logging failures must not fail otherwise successful requests or replace an existing application error. Emit only sanitized local delivery diagnostics and avoid recursive logging on exporter failures.

Verify representative success, failure, authorization-removal, and connection-deletion records in the deployed PostHog project. Check correlation lookup, severity, environment labels, redaction, cold-start delivery, and exporter-failure behavior. Document log access, troubleshooting, verbosity, delivery limitations, and the configured project's retention and sampling policy. PostHog logs are not a permanent audit history.

Expose unauthenticated `GET /ping`. Return HTTP 200 with minimal JSON and `Cache-Control: no-store` when the app handles requests. Do not query Neon or AppFolio, load credentials, trigger authentication maintenance, or reveal configuration. Keep logging minimal. This endpoint checks application availability. Do not implement `/health`.

Use Zod at external-input boundaries. Set request limits and authentication abuse protection. Keep secrets server-side.

## Delivery and verification

Deliver in this order:

1. Record the confirmed OAuth override, architecture, versions, client requirements, operation inventory, and open implementation decisions.
2. Implement website accounts and password changes.
3. Implement multiple private connections, connection settings, encryption, and per-connection AppFolio authentication.
4. Implement MCP authorization with connection selection, immutable grant binding, renewal, client removal, and connection-deletion enforcement.
5. Deliver work-order retrieval as the first integration milestone, with PostHog application logging and `/ping`.
6. Implement every remaining inventoried operation, including writes, uploads, bulk operations, asynchronous results, and deprecated endpoints.
7. Verify full contract coverage, isolation, failure paths, concurrency, write retries, and deployed behavior in all three clients.
8. Document setup, per-operation verification results, and remaining limitations.

Completion requires observed evidence for these cases:

| Area                            | Required evidence                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts                        | Sign-up, sign-in, sign-out, protected pages, rejection of incorrect current passwords and mismatched confirmation, successful password change, documented session and grant behavior, unchanged AppFolio credentials.                                                                                                                                                                                                              |
| Isolation and storage           | One user can create and manage multiple independent connections, including credential sets for the same database with different permissions. User A cannot read or use user B's connections or grants. Secret-only replacement works per connection. Invalid updates preserve valid data. Secrets stay encrypted and absent from browser responses and logs.                                                                       |
| Connection binding              | Consent requires an owned active connection. Forged selections and deletion before issuance fail. Parallel authorizations and grants for the same client keep their selections separate. Calls and renewed tokens use only the bound connection. Inputs cannot override it. Changing selection requires a new grant.                                                                                                               |
| Connection updates and deletion | Rename preserves identity. Secret-only replacement invalidates that connection's token cache and preserves its grants. Changing client ID, database ID, or developer ID requires new grants and leaves old tokens unusable. Deletion disables every bound grant and refresh token across instances, including concurrent issuance and renewal. Other connections work. Recreating a connection cannot revive old tokens or grants. |
| Removal                         | Existing access and refresh tokens stop working after removal, including across instances and concurrent renewal. Other grants remain usable. A new authorization flow restores access without making the removed grant's old tokens usable again.                                                                                                                                                                                 |
| AppFolio authentication         | Valid tokens are reused only within their connection. Missing, expired, and near-expiry states acquire tokens as specified. Separate connections never share caches or acquisition state. Failures block business calls. Stale results cannot undo replacement or deletion. Ambiguous outcomes follow documented recovery.                                                                                                         |
| API coverage                    | Every inventoried operation has a discoverable tool and contract-level request, response, and error verification. No method, upload, bulk, asynchronous, or deprecated operation is silently excluded.                                                                                                                                                                                                                             |
| MCP                             | Work-order retrieval and representative writes succeed. Missing, invalid, expired, incorrectly targeted, wrongly scoped, and revoked tokens fail. Valid refresh grants renew automatically. Invalid refresh grants lead to reauthorization.                                                                                                                                                                                        |
| Serialization and retries       | Verify path and query encoding, required filters, JSON, multipart, empty responses, asynchronous results, rate limits, and response bounds. Retry records and upload or job handles cannot cross grants or connections. Write retries preserve idempotency keys and exact bodies. Ambiguous outcomes and DELETE handling follow the documented contract.                                                                           |
| Clients                         | Record tested versions and environments, complete tool discovery, schema compatibility, callbacks, registration, scopes, connection selection, separate connection configurations, read and write calls, renewal, and removal results for all three agents.                                                                                                                                                                        |
| Operations                      | Verify deployed application logs in PostHog for successful and failed requests, authorization removal, and connection deletion. Check correlation, severity, environment, redaction, serverless delivery, and exporter-failure isolation. `/ping` is unauthenticated, uncached, and independent of dependencies. No `/health` endpoint is added.                                                                                   |
| Build and deployment            | Appropriate checks and meaningful integration and security tests pass. Deployed login, password change, removal, tool execution, renewal, and `/ping` work.                                                                                                                                                                                                                                                                        |

Use contract-level fixtures or a mock upstream to verify all operations, including failure paths, without changing real records. Verify live mutations in an appropriate test environment. Record which operations have live evidence and which have only contract-level evidence. Test AppFolio authentication maintenance where available. Mark unavailable checks as unverified and provide reproducible manual steps. An inventory establishes scope, not implementation or working API coverage. Distinguish documentation review, compilation, automated tests, and live client verification.

The handoff includes implemented behavior, architecture, migrations, deployment steps, environment-variable names without values, password policy, session and grant behavior, multiple-connection management, consent selection and immutable binding, credential-update and deletion effects, token policies, encryption and key management, AppFolio recovery and concurrency rules, operation coverage and contract overrides, write retry behavior, client setup, PostHog Logs configuration and troubleshooting, checks, and remaining limitations.

## Implementation references

Recheck these sources and package APIs at implementation time:

- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization) and the [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
- [Better Auth](https://better-auth.com/docs), [MCP integration](https://better-auth.com/docs/plugins/mcp), [OAuth provider](https://better-auth.com/docs/plugins/oauth-provider), and [token policies](https://better-auth.com/docs/plugins/oauth-provider/tokens).
- [Cursor MCP](https://cursor.com/docs/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp), and [Codex MCP](https://developers.openai.com/codex/mcp).
- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth). Apply client-specific guidance only to the matching product and execution environment.
- [TanStack Start on Vercel](https://vercel.com/docs/frameworks/full-stack/tanstack-start), [MCP on Vercel](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel), and [Runtime Logs](https://vercel.com/docs/logs/runtime).
- [PostHog Logs installation](https://posthog.com/docs/logs/installation), [Node.js logging](https://posthog.com/docs/logs/installation/nodejs), and [serverless delivery](https://posthog.com/docs/libraries/node#short-lived-processes-like-serverless-environments).
