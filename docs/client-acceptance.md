# Coding-agent acceptance

The owner runs these checks in local interactive Cursor, Claude Code and Codex.
Record each client's exact version, OS, protocol revision, registration method,
callback URI, configuration name and evidence. Hosted/headless environments are
separate and remain unverified until explicitly tested.

Use the canonical preview `/api/mcp` URL. A Vercel-protected preview may require an
automation bypass header for machine requests. Application OAuth remains required.
Never commit a bypass credential. Final public production MCP access must not be
blocked by an infrastructure sign-in screen.

Official setup references, to recheck against the installed client version:

- [Cursor MCP](https://cursor.com/docs/mcp)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Codex MCP](https://developers.openai.com/codex/mcp)

Typical Claude Code configuration is `claude mcp add --transport http appfolio
<canonical-url>/api/mcp`, followed by authorization in `/mcp`. Typical Codex
configuration is `codex mcp add appfolio --url <canonical-url>/api/mcp`, followed by
`codex mcp login appfolio`. Cursor uses a remote server entry in MCP settings.
These are setup starting points, not claims of observed compatibility.

## Required sequence for each client

1. Add the remote server and start authorization. Verify discovery and registration.
2. Sign up or sign in. With no saved connections, create one and resume the same flow.
3. Explicitly choose a named connection. Verify the consent client name, callback
   host, scopes and selected connection. Deny once, then authorize a fresh flow.
4. Verify all 181 operation IDs are discoverable and schemas are accepted.
5. Call `getWorkOrders` with an ID or updated-since filter and bounded pagination.
6. Perform an approved write in the designated test database. Verify the actual
   resulting record. Retry unchanged input with its returned idempotency key;
   verify one logical result. Do not mutate a production database.
7. Keep the client connected past access-token expiry. Verify automatic refresh.
8. Remove its authorization in settings. Existing access and refresh tokens must
   stop working. Other grants must remain usable. Reauthorize and verify the old
   token still fails.
9. Configure two separate server names for two connections with the same OAuth
   client. Verify each independently selects and retains its connection.
10. Replace a secret, rename a connection, change an upstream identity, and delete
    a connection. Verify the documented preservation/revocation behavior.
11. Check a file upload, a bulk request, an asynchronous job and a deprecated tool
    in the test environment where practical. Label unavailable live checks.

| Client      | Browser auth | All tools | Read/write | Renewal | Removal | Two connections |
| ----------- | ------------ | --------- | ---------- | ------- | ------- | --------------- |
| Cursor      | Pending      | Pending   | Pending    | Pending | Pending | Pending         |
| Claude Code | Pending      | Pending   | Pending    | Pending | Pending | Pending         |
| Codex       | Pending      | Pending   | Pending    | Pending | Pending | Pending         |

Production launch remains blocked until required verification and owner acceptance.
