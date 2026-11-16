# Contract overrides

The supplied `database-api-openapi.json` is unchanged. `scripts/generate-tools.py`
implements the schema overrides below. The authentication adapter implements the
OAuth override. Contract tests exercise every generated operation.

| Source inconsistency                                                              | Implemented rule                                                                                      | Evidence                                                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Machine-readable legacy Basic security conflicts with introductory OAuth guidance | OAuth client credentials only; bearer, database and developer headers on every operation; no fallback | Live token exchange and work-order request                                         |
| `getWorkOrders.filters` is optional but prose requires ID or updated-since        | Require `Id` or `LastUpdatedAtFrom`                                                                   | Positive and negative contract tests, live date-filtered read                      |
| `next_page_path` is a string but prose says null on the last page                 | Accept string or null                                                                                 | Observed live response, generated response schemas                                 |
| Inventory location PropertyId is a UUID but unattached locations return null      | Accept UUID or null for that response field                                                           | Live test record read-back                                                         |
| `createWorkOrder.oneOf` refers to five object schemas whose IDs are all optional  | Require the corresponding ID in each branch so exactly one target is selected                         | Contract fixtures; without this rule every normal object matches multiple branches |
| UUID query filters document comma-separated lists while using `format: uuid`      | Use an explicit comma-separated hexadecimal-ID pattern for those filters                              | Serialization and schema tests                                                     |
| Multipart File fields describe local paths instead of a remote transfer mechanism | Tool input uses `{filename, mediaType, base64}`; adapter sends actual bytes                           | Multipart serialization and exact-byte retry tests                                 |
| OpenAPI 3.0 `nullable`, references and object schemas without explicit type       | Convert to JSON Schema, preserve reachable definitions, infer object from properties                  | All generated input/response schemas compile                                       |

Validation of a new or changed connection includes token acquisition and a
minimal, read-only work-order request with its database and developer headers.
A 403 probe is inconclusive because credentials may intentionally lack
work-order permission, so it does not reject a valid OAuth connection. Other
probe failures preserve the existing saved connection. Each actual operation
remains subject to upstream permission checks; saving a connection does not
promise access to every tool.

Calls return one page, at most 2 MiB of response data, with a 20-second upstream
request deadline. Multipart requests are at most 2 MiB and inbound MCP JSON is at
most 3 MB. A file path or arbitrary download URL is not an upload input.

Mutation retries have no automatic retry loop. The server persists an encrypted
copy of the exact bytes, content type, operation and URL fingerprint. A logical
caller key is scoped to its grant and mapped to an upstream key. The returned
`idempotencyKey` is the caller key to reuse on another call. Changed input with
that key is rejected. Replays older than 24 hours require a newly confirmed
operation. GET and DELETE do not gain retry safety from an idempotency key.
`Retry-After` is returned in metadata; clients must wait before another attempt.

HTTP 429 is handled as a global rate-limit response even when an endpoint omits
it from its response schemas. Shared execution returns status 429 and a normalized
`{code: 429, message: "AppFolio rate limit exceeded."}` body, preserving
`Retry-After`, the caller's idempotency key, upstream status, and correlation ID.
The body is canceled without parsing, so empty, HTML, or unreadable upstream error
bodies cannot hide the rate limit. All generated tool output contracts accept
this normalized error. No automatic retry occurs. `createWorkOrder` returns the
429 envelope with retry metadata, permitting a later caller-initiated retry with
the same key and unchanged input rather than reporting an unknown write outcome.

Asynchronous endpoints return their accepted JobId without polling. The server
records the job under its originating grant, whose immutable binding identifies
user and connection. `getjobs` accepts only that grant's recorded jobs within
seven days and permits at most one polling call per connection every 3.1 seconds.
No user-supplied URL is followed. A different authorization cannot resume a stored
job even if it targets the same upstream database.

## Deprecated operations

The catalog retains `bulkCreateBill`, `bulkCreateCharge` and
`putBulkUnitPricingMatrix` with deprecation notices. Their respective replacements
are `bulkCreateBillAsync`, `bulkCreateChargeAsync` and
`putBulkUnitPricingMatrixAsync`. Accepted asynchronous requests require a later
`getjobs` call; an accepted job is not a completed write.

The idempotency adapter accepts the contract's full 0–256 printable ASCII key
range. Empty input behaves like an omitted key. Caller keys are scoped by grant
and request path, so the same string can be used on different endpoints. Mutation
responses preserve `Idempotent-Replayed` as `metadata.idempotentReplayed` and
`Retry-After` as `metadata.retryAfter`. Documented global idempotency error statuses
400, 409 and 422 are supported even where an operation's response list omits them.
A local payload mismatch uses status 422 and never sends changed bytes upstream.

## Agent-facing tool documentation

The catalog preserves parameter and request-body descriptions, field semantics,
examples, formats, enum values, defaults, and deprecation notices from the source.
HTML presentation tags are normalized without dropping their text. Argument groups
explain nested JSON query parameters, path IDs, body serialization, pagination,
base64 file transfer, and idempotent retries. Result metadata explains upstream
status, replay identity, retry timing, and request correlation.

Object-only `allOf` compositions are expanded into their intersected properties
and required fields. The required-only work-order filter alternatives and each
work-order creation target also publish their common properties. The alternatives
retain inclusive `anyOf` and exclusive `oneOf` behavior, so documentation does not
weaken the existing validation rules.

`scripts/generate-tools.py` runs `scripts/document-tool-examples.ts` using the
same AJV configuration as runtime validation. Valid source examples are retained;
incompatible examples are omitted from guidance and recorded in
`catalog.omittedDocumentationExamples` with operation, schema location, and reason.
The upstream file remains unchanged. Install the locked Node dependencies before
generating or checking this catalog. Example record IDs are illustrative and must
be replaced with records accessible through the selected connection.

`src/mcp-documentation.test.ts` exercises real MCP discovery for all 181 generated
API tools and the additional `validate_tenant` workflow, for 182 tools total. It
checks descriptions, examples, composed alternatives, and representative valid and
invalid calls. Filters, bodies, pagination, uploads, and retry keys are covered.
Longer reference resources are optional; essential help is present in discovery.
