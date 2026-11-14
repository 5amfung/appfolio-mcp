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
A credential set must permit that probe. An unsuccessful probe preserves the
existing saved connection. This prerequisite is shown in connection settings.

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
