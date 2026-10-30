import { createServerOnlyFn } from '@tanstack/react-start'
import { drizzle } from 'drizzle-orm/neon-http'

function createDatabase() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required to access the database')

  return drizzle(url)
}

let database: ReturnType<typeof createDatabase> | undefined

export const getDb = createServerOnlyFn(() => {
  database ??= createDatabase()
  return database
})
