import 'dotenv/config'
import { getMigrations } from 'better-auth/db/migration'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { getAuth } from '../src/server/auth'
import { getDb, getPool } from '../src/db/index.server'

const mode = process.argv[2]
if (mode !== '--apply' && mode !== '--plan')
  throw new Error('Use --plan or --apply')
try {
  const plan = await getMigrations(getAuth().options)
  if (mode === '--plan') process.stdout.write(await plan.compileMigrations())
  else {
    await plan.runMigrations()
    await migrate(getDb(), { migrationsFolder: 'drizzle' })
    process.stdout.write(
      'Account/provider and application migrations applied.\n',
    )
  }
} finally {
  await getPool().end()
}
