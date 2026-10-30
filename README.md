# appfolio-mcp

TanStack Start foundation for the AppFolio MCP project, using React, TypeScript,
Vite, Tailwind CSS 4.3, and file-based routing.

## Development

Use Node.js 22.12+ (or a current supported release) and pnpm 11.24.0.

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
