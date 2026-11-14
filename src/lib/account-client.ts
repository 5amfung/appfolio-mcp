import { z } from 'zod'
const connection = z.object({
  id: z.string(),
  name: z.string(),
  credentialsSaved: z.boolean(),
  identifierHint: z.string(),
  expiresAt: z.string().nullable(),
})
export const accountSchema = z.object({
  user: z.object({ name: z.string(), email: z.string() }),
  connections: z.array(connection),
  grants: z.array(
    z.object({
      id: z.string(),
      clientName: z.string(),
      connectionName: z.string(),
      createdAt: z.string(),
    }),
  ),
})
export type Account = z.infer<typeof accountSchema>
export async function accountRequest(body?: unknown) {
  const response = await fetch('/api/account', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data: unknown = await response.json()
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(data)
    throw new Error(
      parsed.success
        ? parsed.data.error.replaceAll('_', ' ')
        : 'Request failed. Please try again.',
    )
  }
  return data
}
