# Client acceptance

The owner runs these checks in local interactive Cursor, Claude Code and Codex.
Record each client's exact version, OS, protocol revision, registration method,
callback URI, configuration name and evidence. Hosted/headless environments are
separate and remain unverified until explicitly tested.

Open the original `appfolio-mcp` project's Deployments tab in Vercel. Select the
Preview deployment for the commit you want to test. Copy its unique deployment
URL and append `/api/mcp`. Replace `YOUR-DEPLOYMENT.vercel.app` in the examples
below with that hostname. No manually maintained preview alias is used.

Check whether Vercel Deployment Protection blocks that URL before client testing.
ChatGPT Desktop needs public access to the MCP and OAuth endpoints; a Vercel login
or share link alone is insufficient. Application signup, sign-in, explicit
connection selection and OAuth consent remain required. Reauthorize the client
when changing its server URL. Production remains unpublished until a Release
Please PR is merged. Each PR uses its own Neon database; its accounts and grants
are separate from production and other previews.

## ChatGPT Desktop

Add a custom MCP server in ChatGPT's Plugins settings. Use the selected
deployment's MCP URL and choose OAuth authentication with automatic client
registration. Do not enter
AppFolio credentials as ChatGPT's OAuth client ID or secret. Those credentials
belong in the application's connection form after sign-in.

Complete sign-in, select the designated AppFolio test connection and allow
access. Review the discovered tools, then start a new conversation with this
connection selected. First request a bounded work-order read without writes.
Record the Desktop version, authorization result, tool discovery and read result.
Actual ChatGPT Desktop behavior remains pending the owner's test.

See the [official custom MCP setup instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt#add-the-mcp-server).

## Coding agents

Cursor remote-server entry:

```json
{
  "mcpServers": {
    "appfolio-preview": {
      "url": "https://YOUR-DEPLOYMENT.vercel.app/api/mcp"
    }
  }
}
```

Claude Code HTTP entry:

```json
{
  "mcpServers": {
    "appfolio-preview": {
      "type": "http",
      "url": "https://YOUR-DEPLOYMENT.vercel.app/api/mcp"
    }
  }
}
```

Codex local HTTP entry:

```toml
[mcp_servers.appfolio-preview]
url = "https://YOUR-DEPLOYMENT.vercel.app/api/mcp"
```

Authorize the server through its normal OAuth UI. The deployed server advertises
`mcp:tools` and `offline_access` as its default scopes. No explicit scopes setting
is needed. These scopes enable tool access and automatic token renewal after
consent. For another connection, add a second server name and complete a separate
authorization.
These configuration forms were checked against current official documentation;
the actual installed-client flows still need the owner's acceptance.

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

| Client          | Browser auth | All tools | Read/write | Renewal | Removal | Two connections |
| --------------- | ------------ | --------- | ---------- | ------- | ------- | --------------- |
| Cursor          | Pending      | Pending   | Pending    | Pending | Pending | Pending         |
| Claude Code     | Pending      | Pending   | Pending    | Pending | Pending | Pending         |
| Codex           | Pending      | Pending   | Pending    | Pending | Pending | Pending         |
| ChatGPT Desktop | Pending      | Pending   | Pending    | Pending | Pending | Pending         |

Production launch remains blocked until required verification and owner acceptance.
