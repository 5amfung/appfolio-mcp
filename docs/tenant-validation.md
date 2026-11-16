# Tenant validation and resident work orders

`validate_tenant` matches supplied identity evidence and a rented-unit address
against one authorized AppFolio connection. An `authenticated` result requires
one unambiguous match, `Current` tenant status, and a valid occupancy UUID.
Missing occupancy produces `needs_review`, never a creation-ready success.

## Shared snapshot

The workflow uses Vercel Runtime Cache, not function process memory. One encrypted
snapshot contains the tenant identity fields and associated unit address fields
needed by the matcher. It excludes unrelated tenant data. Cache keys include the
application origin, deployment environment, owner, connection ID, credential
version, and snapshot schema version. Independent connections never share data.

`TENANT_VALIDATION_CACHE_TTL_SECONDS` sets the maximum snapshot age. It defaults
to `43200` seconds, or 12 hours. Use a positive integer, at most `604800` seconds.
Invalid configuration fails validation rather than silently using another TTL.
Lowering the TTL also rejects previously stored snapshots that exceed the new
age limit. Credential replacement changes the cache key. Deletion and grant
revocation prevent access even if a cache entry remains until eviction.

A cache hit makes no AppFolio requests or token-acquisition calls. A miss loads
all current tenant pages, then the associated units in bounded batches. Only a
complete, validated snapshot is published. Pagination has page, record, and
elapsed-time limits, rejects repeated paths, and cannot select arbitrary URLs.
Failed or incomplete loads return an unavailable result, not a negative match.
Concurrent cache misses may perform duplicate read-only fills; entries are
published atomically and are never extended by reads.

Both tenants and unit addresses can remain stale for the configured TTL. The
successful result describes the cached snapshot, not a live identity challenge.
The workflow checks the live grant and connection before returning a result.
It does not reread AppFolio on hits, because that would defeat the latency goal.

The target is below one second for cache-hit validation. Empty or expired caches
still require AppFolio reads, measured previously at several seconds. Runtime
Cache is regional and may evict entries before their TTL. Local development uses
the SDK's in-memory fallback, so local timing does not establish deployed cache
latency. Deployed end-to-end timing must include OAuth validation, live grant
checks, Runtime Cache access, and MCP serialization.

The local MCP integration test on November 15, 2026 exercised 1,000 generated
tenants and unit addresses. Twenty cache-hit calls measured 2.8 ms median and
4.9 ms maximum in a focused run, with zero upstream calls after the fill. This
includes actual SQL authorization in PGlite, encryption, snapshot parsing, and
MCP request/response handling. It excludes remote Neon, hosted Runtime Cache,
and OAuth bearer verification. These numbers do not establish production latency.

Reproduce the local check with
`pnpm exec vitest run src/mcp-tools/validate-tenant.integration.test.ts`.

## Tool boundaries

The generated API catalog stays at 181 operations. The handwritten
`validate_tenant` tool is registered separately, for 182 tools in total. Pure tenant
and address matching owns the evidence rules;
the snapshot loader owns retrieval and caching; the MCP adapter owns schemas and
result formatting. Shared API execution continues to own AppFolio authentication,
grant binding, response validation, and mutation retry identity.

Use the generated `createWorkOrder` tool directly. There is no `create_work_order`
compatibility wrapper. The caller coordinates validation and creation and supplies
the intended work-order fields. The server does not enforce proof of a prior
validation call or the previous wrapper's fixed defaults.

## ElevenLabs maintenance workflow

Configure the client to use `validate_tenant` for matching and `createWorkOrder`
for creation. Collect the caller's first name, last name, phone number, street
address, city, and apartment or unit identifier when applicable. Email is optional
in the tool schema and is not needed for this workflow. State and postal code are
also optional. Send the structured address fields rather than relying on
`rawAddress`.

For example, call `validate_tenant` with:

```json
{
  "firstName": "Avery",
  "lastName": "Tenant",
  "phoneNumber": "4155550101",
  "address": {
    "streetAddress": "960 Market Street",
    "city": "San Francisco",
    "unit": "709"
  }
}
```

Proceed only when the result has `status: "authenticated"`. Use the exact
`tenant.occupancyId` returned by validation. `needs_more_information`,
`needs_review`, `not_authenticated`, or `service_unavailable` must not lead to a
creation call. An `authenticated` result always includes the required occupancy
UUID; a missing occupancy produces review instead of success.

Keep the existing conversation's maintenance-description and priority-selection
rules. Supply a priority of `Urgent`, `Normal`, or `Low`; the tool does not choose
it. Call
`createWorkOrder` with the following shape, replacing the illustrative occupancy
UUID with `tenant.occupancyId`:

```json
{
  "body": {
    "JobDescription": "Repair the leaking kitchen faucet.",
    "OccupancyId": "33333333-3333-4333-8333-333333333333",
    "Priority": "Normal",
    "PermissionToEnter": false,
    "Status": "New",
    "Type": "Internal"
  },
  "idempotencyKey": "maintenance-request-123"
}
```

These fields preserve the previous production behavior, but the caller now owns
their values. In particular, send the maintenance text as `JobDescription`, not
`Description`, and do not substitute `UnitId` or `PropertyId` when an occupancy is
missing. Keep one stable `idempotencyKey` for each logical maintenance request.

The generated tool returns the AppFolio response envelope. Confirm successful
creation with `status: 201` and read the created identifier from `data.Id` and the
optional link from `data.Link`. There is no `status: "created"` or
`workOrder.id` response from a creation wrapper. Both JSON text content and
`structuredContent` are available when an upstream response was parsed.

On `status: 429`, wait according to `metadata.retryAfter` before a caller-initiated
retry. Reuse the same key and unchanged arguments; the server does not retry
automatically. Preserve the returned `metadata.idempotencyKey` if the server
generated one because the caller omitted it.

Local execution or transport failures can return `isError: true` with JSON text
content rather than `structuredContent`. Inspect its `error` and retain the
top-level `idempotencyKey`. In particular,
`write_outcome_unknown_confirm_upstream_before_retry` means the write may already
have completed. Confirm AppFolio before another attempt and do not start a new
write with a new key. Treat upstream server failures or an invalid creation
response as potentially completed writes as well.

## Migration differences

The previous MCP exposed two tools at `/mcp` with encoded AppFolio credentials in
a static bearer header. This server uses `/api/mcp` and OAuth tied to a saved
connection. Configure and test the actual client's authorization and refresh
behavior before switching traffic; changing the URL alone is insufficient.

Validation can now use a snapshot up to the configured TTL instead of reading
AppFolio on each call, and successful validation requires a valid occupancy ID.
Creation uses the generated tool's input and output envelope described above.
Clients must support Streamable HTTP responses, including SSE, and inspect
structured business status even when a tool result sets `isError`. Validate these
paths in the actual ElevenLabs client. Deployed latency and client compatibility
are not established by the local tests.

## Verification

Run `pnpm test:run`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
`pnpm catalog:check`, and `pnpm build`. The tenant-validation tests cover expiry,
isolation, credential changes, revoked grants, incomplete pages, required
occupancy, schema discovery, and cache hits without upstream reads.
