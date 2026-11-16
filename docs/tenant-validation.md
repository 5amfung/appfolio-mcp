# Tenant validation and resident work orders

`validate_tenant` matches supplied identity evidence and a rented-unit address
against one authorized AppFolio connection. An `authenticated` result requires
one unambiguous match, `Current` tenant status, and a valid occupancy UUID.
Missing occupancy produces `needs_review`, never a creation-ready success.

## Shared snapshot

The workflow uses Vercel Runtime Cache, not function process memory. The shared
cache stores a complete current-tenant inventory and independent unit entries.
Entries contain only matching fields and are encrypted. Cache keys include the
application origin, deployment environment, owner, connection ID, credential
version, resource type, and cache schema version. Independent connections never
share data.

`TENANT_VALIDATION_CACHE_TTL_SECONDS` sets the maximum age of both tenant inventory
and unit entries. It defaults to `43200` seconds, or 12 hours. Use a positive
integer, at most `604800` seconds. Invalid configuration fails validation instead
of silently selecting another TTL. Lowering the TTL rejects older entries
immediately. Reads do not extend retention. Credential replacement changes the
keys; deletion and grant revocation prevent access even while old entries remain.

The lookup sequence is:

1. Load the shared tenant inventory, fetching all current-tenant pages on a miss.
2. Find candidates whose first name and phone number match. Phone numbers come
   from each tenant record's `PhoneNumbers` array. Surname and email can strengthen
   the reported evidence but cannot substitute for a mismatching phone.
3. Read unit cache entries only for those candidates' `UnitId` values. Fetch only
   missing unit records, in batches of at most 100 IDs when multiple candidates
   share the provided identity evidence. Do not choose the first candidate before
   checking addresses.
4. Verify street, city, and apartment or unit when applicable. Require exactly one
   acceptable Current match and a valid occupancy UUID before returning success.

A name or phone mismatch makes no unit request. Unit data is not prefetched into
a portfolio-wide index. Each matching unit is cached separately; a failure to
fetch one unit does not invalidate the tenant inventory or another unit's cache.
Missing units are not negatively cached. They produce review and can be fetched
again on the next attempt.

Only complete, validated pages are cached. Pagination has page, record, and
elapsed-time limits, rejects repeated paths, and cannot select arbitrary URLs.
Partial or failed tenant loads are not cached. Unit entries are published only
after their requested batch has completed. Concurrent misses may perform
idempotent duplicate reads; there is no shared mutable unit-index object.

Fully cached validation makes no AppFolio or token-acquisition calls. With the
tenant inventory cached but a candidate unit uncached, validation makes only that
unit lookup. An initial tenant-cache fill still takes several seconds. Both tenant
and requested unit records can be stale within the configured TTL. Metadata's
`fetchedAt` is the oldest source used and `expiresAt` is its maximum allowed age.
The live grant and connection binding are checked before access and again before
returning a result.

The target is below one second for fully cached validation. Remote unit reads,
expired tenant inventories, cache outages, regional cache misses, and evictions
can add upstream latency. Local development uses the SDK's in-memory fallback,
so local timing does not establish deployed latency. The integration test exercises
20 fully cached MCP calls with 1,000 generated tenants and checks that each is
below one second with no upstream calls. It also checks that a second tenant's
unit is fetched lazily and that an unrelated unit failure stays isolated. This
includes actual SQL authorization in PGlite, encryption, schemas, and MCP handling;
it excludes remote Neon, hosted Runtime Cache, and OAuth bearer verification.

Reproduce the local check with
`pnpm exec vitest run src/mcp-tools/validate-tenant.integration.test.ts`.

## Tool boundaries

The generated API catalog stays at 181 operations. The handwritten
`validate_tenant` tool is registered separately, for 182 tools in total. Pure tenant
and address matching owns the evidence rules; the tenant and unit loader owns
retrieval and caching; the MCP adapter owns schemas and result formatting. Shared
API execution continues to own AppFolio authentication, grant binding, response
validation, and mutation retry identity.

Use the generated `createWorkOrder` tool directly. There is no `create_work_order`
compatibility wrapper. The caller coordinates validation and creation and supplies
the intended work-order fields. The server does not enforce proof of a prior
validation call or the previous wrapper's fixed defaults.

## ElevenLabs maintenance workflow

Configure the client to use `validate_tenant` for matching and `createWorkOrder`
for creation. Collect the caller's first name, phone number, street address, city,
and apartment or unit identifier when applicable. Last name and email are optional
corroborating evidence. State and postal code are also optional. Send the
structured address fields rather than relying on `rawAddress`.

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

Validation can now use cached tenant and lazily fetched unit records up to the
configured TTL instead of reading AppFolio on each call, and successful validation
requires a valid occupancy ID.
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
