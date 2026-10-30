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
