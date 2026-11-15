import { createFileRoute } from '@tanstack/react-router'
import { accountApi } from '@/server/account-api'
export const Route = createFileRoute('/api/account')({
  server: {
    handlers: {
      GET: ({ request }) => accountApi(request),
      POST: ({ request }) => accountApi(request),
    },
  },
})
