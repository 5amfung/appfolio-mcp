# Preview and production deployments

Use the existing Vercel project `appfolio-mcp` in team `doughyrematch`.
The temporary preview project was deleted. Do not create additional Vercel
projects or manually assign a shared hostname for PR previews.

## Release policy

Vercel's Git integration owns deployments. `main` remains the production branch.
GitHub Actions runs tests and Release Please. No Vercel token, deploy hook or
additional release branch is required.

For every proposed production build, the Ignored Build Step runs
`scripts/check-release.mjs`. It queries public GitHub metadata and requires:

- The source branch is `main` and the source SHA is valid.
- That exact SHA is the merge commit of a merged PR into `main`.
- The PR comes from this repository's Release Please branch.
- The PR has a recognized release label and Release Please author.

Ordinary merges are skipped. API failures, missing scripts, invalid responses
and script failures also skip production. Vercel may show a skipped deployment
record, but no production build or domain update occurs. The shell command in
`vercel.json` translates checker success to Vercel's unusual build/skip exit codes.
Tests exercise both the policy and the real shell command.

The Release Please workflow uses the same checker when it publishes a release.
It dispatches CI for its generated PR using GitHub's built-in token, because
updates made with that token do not trigger ordinary pull-request workflows.
Merging the application PR updates the pending Release Please PR; it does not
publish production. Merging the Release Please PR is the production release
decision. Do not merge that PR until launch verification is accepted.

The tokenless check relies on this repository being public. If the repository
becomes private, production remains skipped until an authenticated policy is
configured. If GitHub is unavailable, retry the release deployment after it
recovers. Do not replace the check with a permissive fallback.

## Database mapping

| Deployment  | Neon database                                                                       |
| ----------- | ----------------------------------------------------------------------------------- |
| Production  | Existing project `wild-flower-12064506`, branch `production`                        |
| PR Preview  | Integration-created `preview/<git-branch>` child of the default `production` branch |
| Development | Optional integration-created `vercel-dev` branch                                    |

Use the existing Neon-managed Vercel integration. It supplies Production
connections and injects each Preview deployment's own connections. The old
shared Preview connection is no longer a usable fallback. Automatic cleanup
can remove obsolete preview branches when their Git branches are deleted.

`DATABASE_URL` is pooled for the running app. Migrations use
`DATABASE_URL_UNPOOLED`. Both must identify the same database and branch.
`NEON_PRODUCTION_ENDPOINT_ID` identifies the existing production compute.
The build rejects a Preview connection to that compute and rejects a Production
connection to any other compute, before migrations run.

The build applies provider and application migrations before compiling the app.
On a new Preview database, it clears copied production accounts, authorizations,
encrypted connections and signing keys once. This prevents a PR from inheriting
usable production credentials or signing keys encrypted with another environment's
secret. An initialization marker and transaction lock preserve test data on later
builds of the same PR. Production never runs this initialization.

## OAuth and configuration

Production uses `https://appfolio-mcp-zeta.vercel.app` as its canonical origin,
with separate production auth/encryption keys. Preview variables never include
the production keys. A private recovery copy of generated production keys is
stored in the ignored `.cache/production-keys.json`; retain an owner-controlled
secure backup before publishing production.

PRs derive their OAuth origin from Vercel's unique deployment URL, falling back
to its automatically managed branch URL if the deployment URL is unavailable.
Leave `BETTER_AUTH_URL` unset or empty in Preview, including branch-specific
overrides. Do not assign or maintain a shared preview hostname. Copy the exact
deployment URL from Vercel into the MCP client and reauthorize when changing it.

Application OAuth remains required for tools, regardless of Vercel Deployment
Protection. A client that cannot authenticate to Vercel, such as ChatGPT Desktop,
needs its selected deployment URL to be publicly reachable. A Vercel login or
share link alone does not establish public MCP access. Verify the deployment's
access settings before client testing. Each PR preview has its own accounts and
connection selection.

## Initial consolidation

The initial unconfigured Production deployment was deleted. The original
project was unpaused with explicit owner approval after confirming it had no
Production deployments and installing the release filter. No ordinary merge is
eligible for production. Project-wide pause is an emergency control that also
blocks new previews; do not use it as the normal release gate.

The original project's PR preview passed deployed server and browser checks.
The owner deleted the temporary project through the Vercel dashboard. After
merging the application PR, use the pending Release Please PR's isolated preview
for release acceptance. Select its deployment URL directly in the client.
Production remains unavailable until that Release Please PR is merged.

Verify with `BASE_URL=<preview-origin> EXPECT_PRODUCTION_UNPUBLISHED=1 python3
scripts/verify-public-preview.py` before the first release. Then run the
real-server read-only and browser scripts with the four designated AppFolio test
variables. Do not enable mutation tests against another AppFolio database.
