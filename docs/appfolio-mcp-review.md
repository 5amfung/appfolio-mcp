# AppFolio MCP brief review

Reviewed November 13, 2026, and updated after the user's scope decisions. This review covers the pasted brief, repository OpenAPI document, README, and package manifest. It is a document and contract review, not implementation or live client verification.

The user confirmed OAuth with automatic AppFolio access-token renewal, version-one support for every API operation in `database-api-openapi.json`, multiple private AppFolio connections per account, and application logs sent to PostHog. During coding-agent authorization, the user selects one connection for that authorization. The [implementation brief](appfolio-mcp-brief.md) records these decisions. Authentication type, release scope, connection cardinality, and log destination no longer need product clarification.

## Resolved findings

### 1. P1 resolved: Renew access tokens rather than client secrets

The original brief required a client-secret expiration and automatic secret rotation. The contract's `/info/description` documents `POST https://api.appfolio.com/oauth/token` with `grant_type=client_credentials`, followed by new access-token requests using the response's `expires_in`.

Decision: use OAuth-generated AppFolio credentials, retain the client secret until manual replacement, and renew access tokens automatically. Encrypt any persisted access token and manage its UTC expiration. Automatic client-secret rotation is outside scope.

The token-response schema, error handling, and live upstream behavior still need implementation verification. Those checks do not reopen the selected authentication model.

### 2. P1 resolved by an explicit authentication override

The source OpenAPI root `/security` and `/components/securitySchemes` declare only `basic_auth`, although its introduction documents OAuth.

Decision: preserve the supplied source and explicitly override Basic auth in the AppFolio adapter and any client-generation configuration. Business calls use bearer access tokens with the developer ID and database ID headers. Do not fall back to Basic after an OAuth failure. Verify these headers across every operation.

The inconsistency remains in the upstream file. It is now a documented implementation rule rather than a missing product decision.

### 3. P2 resolved: Enforce work-order filters for both retrieval and listing

The `getWorkOrders` schema marks `filters` optional, but its description requires `Id` or `LastUpdatedAtFrom`.

Decision: require at least one of those filters, serialize the documented bracketed query parameters, and preserve the remaining filters and pagination. An ID lookup uses `GET /work_orders` with `filters[Id]`. Date-filtered listing is also in scope. Record empty-result behavior and test the explicit validation override.

### 4. P2 resolved: Version one covers the entire operation list

The original brief referred to an undefined "agreed" GET tool set. The user has replaced that scope with every declared operation in the supplied OpenAPI file, including writes and deletes.

The current contract contains 181 operations across 161 paths:

| Method | Operations |
| ------ | ---------- |
| GET    | 68         |
| POST   | 66         |
| PATCH  | 36         |
| DELETE | 6          |
| PUT    | 5          |

Every operation has a unique `operationId`. Use that ID as its tool name and retain the full method-and-path mapping. The generated [operation inventory](appfolio-api-inventory.md) lists the release scope and source hash. Regenerate it with `python3 scripts/generate-appfolio-api-inventory.py`; verify freshness with `python3 scripts/generate-appfolio-api-inventory.py --check`.

Work-order retrieval remains a useful first integration milestone. It does not define the release boundary. Every listed operation needs a tool and contract-level verification before version one is complete.

## Requirements introduced by full API coverage

Full scope includes 113 non-GET operations, 15 multipart upload operations, and three deprecated operations. Retain and label `bulkCreateBill`, `bulkCreateCharge`, and `putBulkUnitPricingMatrix`; document their asynchronous replacements without removing the original operations.

Generate schemas carefully. The source uses references, composed schemas, nullable values, and nested query objects. Some POST actions have no request body, while DELETE operations can return HTTP 204 without a JSON body. Handle the declared operation rather than inferring behavior from the method alone.

Uploads need an explicit transfer contract. A remote Vercel function cannot read a file from the agent's computer merely because the tool receives a local path. Define how file bytes, filename, and content type reach the server, within deployment limits, and verify all multipart fields.

The source introduction documents idempotency keys for POST, PATCH, and PUT. GET and DELETE ignore the header. Keys expire after 24 hours, and the server fingerprints the raw request body. Reuse the same key and exact serialized bytes on a retry, including multipart boundaries. Support replay across repeated tool invocations for one logical operation. Preserve documented replay, in-progress, payload-mismatch, and re-execution behavior. Do not promise unconditional exactly-once execution.

Distinguish accepted asynchronous jobs from completed operations. Preserve job identifiers, polling constraints, direct bulk results, and partial failures even when HTTP status indicates success. A client must be able to retrieve declared job results without an indefinitely running tool call.

The contract's descriptive webhook guidance is not an additional incoming-webhook implementation requirement. Full API coverage means all operations declared under `paths`. OAuth token acquisition remains required internal functionality even though it is described outside `paths`.

## Multiple connections and authorization binding

The later clarification replaces the original one-connection-per-user limit. Model one account owning many private connection records. Each connection contains its own client ID, encrypted client secret, database ID, and developer ID, plus a display name and internal identity. Credential sets for the same AppFolio database can have different permissions, so database ID cannot identify a connection or its cached token.

The user described a client token or secret associated with a connection. The binding belongs to the user authorization grant and its access and refresh tokens. OAuth client registration remains the coding agent's identity; attaching the selected connection globally to that registration would mix users or independent grants. AppFolio client secrets belong only to their respective connection records and are never sent to the coding agent.

The revised brief requires explicit connection selection during consent, server-side ownership validation, and exactly one immutable connection binding per grant. Renewal preserves the binding. Changing the selected connection requires a new grant. Separate authorizations for the same user and OAuth client must coexist without replacing each other's selections. A user-wide active connection or a user/client-only grant lookup does not satisfy this model.

Renaming a connection or replacing only its client secret preserves grant bindings. Credential changes invalidate its own token cache. Changing client ID, database ID, or developer ID revokes existing grants and requires new authorization, preventing old tokens from silently targeting a different upstream identity. Deleting a connection makes every bound grant unusable, including concurrent issuance and renewal. It does not affect other connections. Recreating a deleted connection cannot revive its grants or old tokens. Ownership cannot transfer between users. These lifecycle choices are explicit in the brief and its acceptance checks.

Test different-permission connections for the same database, parallel consent flows, forged connection selections, refresh binding, stale credential writes, and deletion followed by recreation. Retry records, upload handles, and job context must stay bound to their originating grant and connection. The authorization list must identify each grant's connection. Verify how each target agent configures separate authorizations for different connections.

## PostHog application logs

The latest decision replaces Vercel Runtime Logs as the application-log destination with PostHog Logs. Logging is required in version one; proactive alerts remain deferred. Existing browser analytics does not prove server-log delivery.

PostHog documents native Node.js logging and OpenTelemetry export. Choose a supported server integration and configure the project, region, and project token through server-side environment variables. Record structured service, environment, severity, and correlation fields. [PostHog Node.js logging](https://posthog.com/docs/logs/installation/nodejs).

The revised brief retains credential redaction and non-failing logging behavior, and adds bounded export, request-lifecycle flushing, and deployed ingestion checks. Vercel can freeze a function before background telemetry completes, so verify delivery on both successful and failed request paths. [PostHog serverless guidance](https://posthog.com/docs/libraries/node#short-lived-processes-like-serverless-environments).

Acceptance requires observed records in the target PostHog project, including correlation lookup, redaction, authorization removal, connection deletion, and exporter-failure isolation. Document retention, sampling, and delivery limitations. Platform-generated Vercel logs remain separate infrastructure diagnostics.

## Implementation checks retained from the original review

- Immediate revocation needs more than JWT verification. Better Auth documents that `requireMcpAuth` verifies access tokens locally without a database lookup. Define the durable grant check, token-to-grant mapping, and renewal race behavior. [Better Auth MCP integration](https://better-auth.com/docs/plugins/mcp). A check keyed only by user and client could accept an old token after reauthorization. Bind tokens to an immutable grant identity or generation, and test removal, reauthorization, and replay of the old token. Check access-token type and required scopes as well.
- Select one supported Better Auth integration. Current guidance uses `@better-auth/mcp`, its CIMD companion, and the official SDK v2. The MCP plugin includes OAuth-provider behavior. Verify the package combination against the existing TanStack MCP scaffold before choosing an adapter. [Better Auth MCP integration](https://better-auth.com/docs/plugins/mcp).
- Registration varies by protocol and client. The current MCP authorization revision prefers CIMD and retains DCR for compatibility. Pin supported revisions and demonstrate the selected registration path in each client. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
- Check the actual Codex execution environment. Its documentation describes CIMD, DCR, preconfigured client IDs, and callback selection rules. Those options do not prove interoperability with this server. [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
- Choose synchronization compatible with the database driver. The repository README describes Neon HTTP with non-interactive transactions. Do not assume a connection-scoped lock can span separate HTTP queries and an upstream request. Prove coordination and conditional writes against replacement, deletion, crashes, and expiry.

## Remaining design choices

Record these during implementation without treating them as unresolved release scope:

- Password-change effects on browser sessions and MCP grants.
- Token lifetimes, refresh-token rotation and reuse policy, and inactivity behavior.
- Provider storage and token-to-grant mapping that support immutable connection bindings and repeated authorizations from the same client.
- Upload representation, limits, request deadlines, pagination, and retry budgets.
- Encryption-key storage, recovery, and replacement procedure.
- Production prerequisites for email verification and password recovery.
- Handling of existing demo tools and browser analytics when private account flows are added.
- PostHog project and region, supported server-log integration, and retention, sampling, and export configuration.

## Verification and limits

The local OpenAPI file was parsed to enumerate all HTTP operations and check operation ID uniqueness, methods, body formats, deprecations, authentication guidance, and work-order filters. The inventory script makes that scope reproducible. Inventory freshness and document consistency checks verify this revision; an operation list does not establish implemented support.

Earlier official-source checks covered Better Auth MCP integration and token policies, MCP authorization, and Codex MCP documentation. Other implementation references remain for later verification. No new live integration claims are made by this scope update.

The PostHog update used the connected PostHog documentation search and logging skill to check supported server integrations and serverless delivery requirements. No PostHog project was configured, no telemetry was sent, and no live log ingestion is claimed by this document change.

The local Intent check failed again because the project-pinned pnpm could not be fetched and verified. Dependencies remain absent. No replacement was installed and no verification was bypassed. Application tests, client login, live token renewal, AppFolio calls, and deployment checks were not run for this documentation update.
