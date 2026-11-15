// @vitest-environment node
import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { connections } from './schema'

it('migrates an empty database and preserves rows and history on reapply', async () => {
  const pg = new PGlite()
  try {
    const db = drizzle({ client: pg })
    const config = { migrationsFolder: 'drizzle' }
    await migrate(db, config)

    const history = await pg.query(
      'select hash from drizzle.__drizzle_migrations order by created_at',
    )
    expect(history.rows).toEqual(
      readMigrationFiles(config).map(({ hash }) => ({ hash })),
    )
    const [connection] = await db
      .insert(connections)
      .values({
        id: 'migration-test',
        userId: 'owner',
        name: 'Migration test',
        credentials: 'encrypted',
      })
      .returning()
    expect(connection.identifierHint).toBe('Credentials saved')
    expect(connection.jobsPollAfter).toBeNull()

    await migrate(db, config)

    expect(
      (
        await pg.query(
          'select hash from drizzle.__drizzle_migrations order by created_at',
        )
      ).rows,
    ).toEqual(history.rows)
    expect(await db.select().from(connections)).toEqual([connection])
  } finally {
    await pg.close()
  }
}, 30_000)
