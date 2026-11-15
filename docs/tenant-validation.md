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

The generated API catalog stays at 181 operations. The handwritten tools are
registered separately. Pure tenant and address matching owns the evidence rules;
the snapshot loader owns retrieval and caching; the MCP adapter owns schemas and
result formatting. Shared API execution continues to own AppFolio authentication,
grant binding, response validation, and mutation retry identity.

`create_work_order` accepts `description`, `occupancyId`, `priority`, and an
optional `idempotencyKey`. It reuses the existing `createWorkOrder` operation with
`PermissionToEnter: false`, `Status: New`, and `Type: Internal`. It preserves
retry metadata and ambiguous write outcomes. The general `createWorkOrder` tool
remains available. The caller coordinates validation and creation; the wrapper
does not enforce proof of a prior validation call.

## Verification

Run `pnpm test:run`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
`pnpm catalog:check`, and `pnpm build`. The tenant-validation tests cover expiry,
isolation, credential changes, revoked grants, incomplete pages, required
occupancy, schema discovery, and cache hits without upstream reads.
