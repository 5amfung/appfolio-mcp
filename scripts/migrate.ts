import 'dotenv/config'
import { getMigrations } from 'better-auth/db/migration'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { getAuth } from '../src/server/auth'
import { getDb, getPool } from '../src/db/index.server'
import { migrationTarget, initializePreview } from './database-target.mjs'

const mode = process.argv[2]
if (mode !== '--apply' && mode !== '--plan')
  throw new Error('Use --plan or --apply')
process.env.DATABASE_URL = migrationTarget({
  environment: process.env.VERCEL_ENV,
  connection: process.env.DATABASE_URL,
  direct: process.env.DATABASE_URL_UNPOOLED,
  productionEndpoint: process.env.NEON_PRODUCTION_ENDPOINT_ID,
})
try {
  const plan = await getMigrations(getAuth().options)
  if (mode === '--plan') process.stdout.write(await plan.compileMigrations())
  else {
    await plan.runMigrations()
    await migrate(getDb(), { migrationsFolder: 'drizzle' })
    if (process.env.VERCEL_ENV === 'preview') await initializePreview(getPool())
    process.stdout.write(
      'Account/provider and application migrations applied.\n',
    )
  }
} finally {
  await getPool().end()
}
