import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '@/server/auth'
export const Route = createFileRoute('/.well-known/$')({
  server: { handlers: { GET: ({ request }) => getAuth().handler(request) } },
})
