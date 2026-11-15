import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/ping')({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { ok: true },
          { headers: { 'Cache-Control': 'no-store' } },
        ),
    },
  },
})
