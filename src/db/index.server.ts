import { createServerOnlyFn } from '@tanstack/react-start'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { Pool, neonConfig } from '@neondatabase/serverless'
import WebSocket from 'ws'
import { HttpsProxyAgent } from 'https-proxy-agent'

// Managed development environments may require their inherited HTTP proxy.
const proxy = process.env.https_proxy ?? process.env.HTTPS_PROXY
neonConfig.webSocketConstructor = proxy
  ? class extends WebSocket {
      constructor(address: string, protocols?: string | string[]) {
        super(address, protocols, { agent: new HttpsProxyAgent(proxy!) })
      }
    }
  : WebSocket
import { attachDatabasePool } from '@vercel/functions'

let pool: Pool | undefined
export const getPool = createServerOnlyFn(() => {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 5_000,
    })
    if (process.env.VERCEL) attachDatabasePool(pool)
  }
  return pool
})
export const getDb = createServerOnlyFn(() => drizzle({ client: getPool() }))
