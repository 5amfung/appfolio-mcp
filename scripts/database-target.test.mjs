// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { migrationTarget, initializePreview } from './database-target.mjs'

const productionEndpoint = 'ep-production-example'
const production =
  'postgresql://role:password@ep-production-example.aws.neon.tech/neondb'
const preview =
  'postgresql://role:password@ep-preview-example-pooler.aws.neon.tech/neondb'
const direct = preview.replace('-pooler', '')

it('uses the matching direct connection for preview migrations', () => {
  expect(
    migrationTarget({
      environment: 'preview',
      connection: preview,
      direct,
      productionEndpoint,
    }),
  ).toBe(direct)
})
it('requires production to use its configured production endpoint', () => {
  expect(
    migrationTarget({
      environment: 'production',
      connection: production,
      productionEndpoint,
    }),
  ).toBe(production)
  expect(() =>
    migrationTarget({
      environment: 'production',
      connection: preview,
      productionEndpoint,
    }),
  ).toThrow('does not match')
})
it('rejects production credentials in a preview before any SQL runs', () => {
  expect(() =>
    migrationTarget({
      environment: 'preview',
      connection: production,
      productionEndpoint,
    }),
  ).toThrow('does not match')
  expect(() =>
    migrationTarget({
      environment: 'preview',
      connection: production.replace('.aws', '-binding-pooler.aws'),
      productionEndpoint,
    }),
  ).toThrow('does not match')
})
it('rejects a direct URL that points to another database or branch', () => {
  expect(() =>
    migrationTarget({
      environment: 'preview',
      connection: preview,
      direct: production,
      productionEndpoint,
    }),
  ).toThrow('same branch')
  expect(() =>
    migrationTarget({
      environment: 'preview',
      connection: preview,
      direct: direct.replace('/neondb', '/other'),
      productionEndpoint,
    }),
  ).toThrow('same branch')
})
it('requires the production endpoint guard on Vercel', () => {
  expect(() =>
    migrationTarget({ environment: 'preview', connection: preview }),
  ).toThrow('NEON_PRODUCTION_ENDPOINT_ID')
})

it('does not include malformed credentials in connection errors', () => {
  expect(() => migrationTarget({ connection: 'secret-not-a-url' })).toThrow(
    'Database connection is missing or invalid',
  )
})
it('rejects another database service on Vercel', () => {
  expect(() =>
    migrationTarget({
      environment: 'preview',
      connection: preview.replace('.aws.neon.tech', '.example.com'),
      productionEndpoint,
    }),
  ).toThrow('configured Neon')
})

let pg
beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(await readFile('docs/auth-schema.sql', 'utf8'))
  for (const directory of (await readdir('drizzle')).sort())
    if (!directory.startsWith('.'))
      await pg.exec(
        await readFile(`drizzle/${directory}/migration.sql`, 'utf8'),
      )
}, 30_000)
afterAll(async () => pg.close())

it('clears cloned production users, keys and connections once, then preserves PR test data', async () => {
  await pg.exec(`insert into "user" (id,name,email,"emailVerified","updatedAt") values ('production','Production','production@example.test',true,now());
    insert into jwks (id,"publicKey","privateKey","createdAt") values ('production-key','public','production-encrypted-private-key',now());
    insert into appfolio_connection (id,user_id,name,credentials) values ('production-connection','production','Production','encrypted-production-credentials');`)
  const pool = {
    connect: async () => ({ query: (sql) => pg.query(sql), release() {} }),
  }
  await initializePreview(pool)
  expect((await pg.query('select id from "user"')).rows).toHaveLength(0)
  expect((await pg.query('select id from jwks')).rows).toHaveLength(0)
  expect(
    (await pg.query('select id from appfolio_connection')).rows,
  ).toHaveLength(0)
  await pg.exec(
    `insert into "user" (id,name,email,"emailVerified","updatedAt") values ('preview','Preview','preview@example.test',false,now());`,
  )
  await initializePreview(pool)
  expect((await pg.query('select id from "user"')).rows).toEqual([
    { id: 'preview' },
  ])
})
