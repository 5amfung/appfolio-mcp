# appfolio-mcp

TanStack Start foundation for the AppFolio MCP project, using React, TypeScript,
Vite, Tailwind CSS 4.3, and file-based routing.

## Development

Use Node.js 22.22.2+, 24.15.0+, or 26+ and pnpm 11.24.0. These Node.js
ranges match the current dependencies; Node.js 23 and 25 are unsupported.
Dependency installation enforces the supported range via `engineStrict` in
`pnpm-workspace.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. The starter page demonstrates a server-backed counter.
The counter is stored in the ignored local `count.txt` file; delete it to reset.
This file-backed demo is intended for local development and is not a production
persistence layer (concurrent writes and ephemeral hosting require a database).

## Verification

```sh
pnpm build
pnpm typecheck
```

Run the build before the first type check to generate `src/routeTree.gen.ts`.
TanStack also updates this generated file during development; do not edit it manually.

## GitHub CI and releases

The `CI` workflow runs on pull requests, pushes to `main`, and manual dispatches.
It tests Node.js 22.22.2, 24.15.0, and 26 with the pnpm version in `package.json`,
installs from the frozen lockfile, and checks formatting, lint, build, types, and
tests. Build runs before typecheck to generate the TanStack route types. No
application secrets are required.

[Release Please](https://github.com/googleapis/release-please) runs on pushes to
`main` and manual dispatches. It maintains a release pull request with the next
`package.json` version and `CHANGELOG.md`; merging that PR creates a `vX.Y.Z` tag
and GitHub release. The manifest starts at the current package version, `0.1.0`.
The private application is not published to npm.

Use Conventional Commits in commits merged to `main` (or squash-merge PR titles):
`fix:` for patches, `feat:` for minor releases, and `feat!:` or a
`BREAKING CHANGE:` footer for major releases. Routine `chore:` and `docs:` commits
do not trigger releases on their own.

In repository **Settings → Actions → General → Workflow permissions**, enable
**Allow GitHub Actions to create and approve pull requests**. The release workflow
grants write permissions only to its release job.

By default, releases use `GITHUB_TOKEN`. As explained in the
[Release Please token documentation](https://github.com/googleapis/release-please-action#other-actions-on-release-please-prs),
PRs and tags created with that token do not trigger other Actions workflows.
To automatically run CI on release PRs (including when CI is a required check),
add a repository Actions secret named `RELEASE_PLEASE_TOKEN` containing a
fine-grained personal access token with repository Contents, Issues, and Pull
requests read/write access. The workflow uses that secret when present and falls
back to `GITHUB_TOKEN` otherwise.

## Tests

```sh
pnpm test     # Watch mode during development
pnpm test:run # Run once, including in CI
```

Vitest uses a separate `vitest.config.ts` with React and jsdom, plus Testing
Library matchers and automatic cleanup in `src/test/setup.ts`. Place tests beside
the code as `*.test.ts` or `*.test.tsx`. The index route tests mock the router and
server-function boundaries, covering rendering, pending updates, and error recovery
without reading or writing `count.txt`.

## Structure

- `src/router.tsx`: router factory and registered router types.
- `src/routes/__root.tsx`: HTML document, metadata, and route outlet.
- `src/routes/index.tsx`: starter route and counter server functions.
- `src/styles.css`: global stylesheet and Tailwind CSS import.
- `vite.config.ts`: Tailwind CSS, TanStack Start, and React plugins.

Based on the [TanStack Start build-from-scratch guide](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch).

## Formatting

```sh
pnpm format
pnpm format:check
```

Prettier uses `prettier-plugin-tailwindcss` to sort utility classes using
`src/styles.css`. Generated route and lock files are excluded; ignored build
artifacts are also skipped.

## Linting

```sh
pnpm lint
pnpm lint:fix
```

ESLint uses the recommended JavaScript, TypeScript, and TanStack Start rules.
Prettier handles formatting; generated routes and build output are excluded.
ESLint 9 and TypeScript 6.0 satisfy the lint plugins' declared peer ranges.

## Import aliases

Use `@/` to import from `src/`, for example `@/styles.css?url`.
The mapping is defined in `tsconfig.json`; Vite reads it through
`resolve.tsconfigPaths`.

## Database (Drizzle + Neon)

Copy `.env.example` to `.env` and set `DATABASE_URL` to your Neon PostgreSQL
connection string. Keep it server-only; set the same environment variable in
your deployment environment. Drizzle Kit loads `.env` using dotenv; Vite loads
it during local development.

Define tables in `src/db/schema.ts`. No application tables are predefined.
Inside a server function, import `getDb` from `@/db/index.server` and call
`const db = getDb()`. The client is created lazily, so builds do not require
database credentials. The Neon HTTP driver supports individual queries and
non-interactive transactions; interactive transactions require a different driver.

```sh
pnpm db:generate # Generate SQL migrations after defining tables
pnpm db:migrate  # Apply migrations to DATABASE_URL
pnpm db:studio   # Open the database browser
```

Commit generated `drizzle/` migrations. For disposable development databases,
`pnpm db:push` applies schema changes directly without migration files.
Migration, push, and Studio commands need a configured connection string.
Drizzle ORM and Kit use the release-candidate versions from the Neon guide.
ESLint enforces `where()` clauses on Drizzle updates and deletes.

## MCP scaffold

Run `pnpm dev`. Remote MCP clients connect to `/api/mcp` using Streamable HTTP;
GET, POST, and DELETE are forwarded to the TanStack MCP server.
Open `/mcp-demo` for an in-process typed client demonstration.

The server in `src/mcp-server.ts` registers `get_weather` (static demo data),
`file:///city-guide.md` (an embedded resource, not a disk read), and `trip_brief`
(a prompt template). No model key, database, or AppFolio credentials are needed.
The demo client bypasses HTTP and authentication; it does not test remote auth.
This scaffold has no authentication and exposes only demonstration content.
Add authentication and real business tools before connecting private data.

## Forms

TanStack Form is available through `@tanstack/react-form` (`useForm`,
`createFormHook`, and `formOptions`). The `@tanstack/react-form-start` adapter
provides server validation helpers for TanStack Start. No global provider is
required. Import form APIs directly where a form is implemented.
