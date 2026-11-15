# Delivery status

The AppFolio MCP application is implemented. Deployment configuration is being
consolidated into the original Vercel project under the
[deployment policy](deployment-policy.md).

- Application PR: https://github.com/5amfung/appfolio-mcp/pull/15.
- Vercel project: appfolio-mcp, in team doughyrematch.
- Public review endpoint: https://appfolio-mcp-preview.vercel.app/api/mcp.
- Production origin: https://appfolio-mcp-zeta.vercel.app.
- Neon project: wild-flower-12064506.
- Production/default Neon branch: production.
- PR databases: integration-created preview branches cloned from production.
- The old unconfigured Production deployment was deleted. Production remains
  unpublished until a Release Please PR is merged.
- The original project was unpaused with explicit owner approval after installing
  the release filter and confirming no Production deployments remained.
- The public preview alias moved back to the original project. The owner deleted
  the extra appfolio-mcp-preview Vercel project.

## Verification

All 181 tools have input/response schemas, descriptions and contract fixtures.
The suite has 256 tests, including release eligibility, shell build/skip mapping,
database-branch guards and one-time preview initialization. Build, types, lint,
formatting and catalog checks pass. CI passed the deployment-policy commit on
all three supported Node versions.

The original project's preview created its own Neon branch and applied migrations
there. The production branch still has no application schema. Without a Vercel
cookie, deployed checks passed account creation, encrypted connection storage,
DCR defaults, explicit selection, consent, PKCE, all 181 tools, a live work-order
read, refresh rotation, refreshed access, revocation, deletion and password checks.
Headless Chromium passed accounts/passwords and browser OAuth. Production domains
returned 404 with DEPLOYMENT_NOT_FOUND instead of serving an unaccepted app.

This verification used only the designated AppFolio test connection and made no
AppFolio mutations. Earlier representative create/replay/update/read-back evidence
is recorded in verification.md. Most operations have contract-level fixtures;
exhaustive live upstream coverage is not claimed.

## Release workflow

Vercel deploys from main using its Git integration. The Ignored Build Step allows
production builds only for the exact merge commit of a verified Release Please
PR. Ordinary merges are skipped. GitHub Actions publishes releases and runs CI
on generated release PRs without a Vercel token or another release branch.

The pending Release Please PR is the launch decision. Leave it open until the
owner accepts client testing. Merging the application PR does not deploy
production or migrate the production database.

Use client-acceptance.md for Cursor, Claude Code, Codex and ChatGPT Desktop.
Client-specific results remain pending the owner. Live upload/bulk/async checks
where feasible, deployed exporter-outage injection and cross-instance race
injection remain unverified. See operations.md for environment/recovery procedures
and verification.md for observed evidence.
