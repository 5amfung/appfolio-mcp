import 'dotenv/config'
import { acquireToken } from '../src/server/connections'
import { catalog, ajv } from '../src/appfolio/contract'
const names = [
  'APPFOLIO_TEST_CLIENT_ID',
  'APPFOLIO_TEST_CLIENT_SECRET',
  'APPFOLIO_TEST_DATABASE_ID',
  'APPFOLIO_TEST_DEVELOPER_ID',
]
if (names.some((n) => !process.env[n]))
  throw new Error('All four APPFOLIO_TEST credentials are required')
try {
  const token = await acquireToken({
    clientId: process.env.APPFOLIO_TEST_CLIENT_ID!,
    clientSecret: process.env.APPFOLIO_TEST_CLIENT_SECRET!,
    databaseId: process.env.APPFOLIO_TEST_DATABASE_ID!,
    developerId: process.env.APPFOLIO_TEST_DEVELOPER_ID!,
  })
  process.stdout.write(
    JSON.stringify({ oauth: 'success', expiresAt: token.expiresAt }) + '\n',
  )
  const response = await fetch(
    'https://api.appfolio.com/api/v0/work_orders?filters[LastUpdatedAtFrom]=2026-11-14T00:00:00Z&page[size]=1&page[number]=1',
    {
      headers: {
        Authorization: `Bearer ${token.token}`,
        'X-AppFolio-Database-ID': process.env.APPFOLIO_TEST_DATABASE_ID!,
        'X-AppFolio-Developer-ID': process.env.APPFOLIO_TEST_DEVELOPER_ID!,
      },
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    },
  )
  const operation = catalog.operations.find((o) => o.name === 'getWorkOrders')!
  const data: unknown = await response.json()
  const valid = ajv.validate(operation.responses[String(response.status)], data)
  process.stdout.write(
    JSON.stringify({
      workOrdersStatus: response.status,
      valid,
      errors: ajv.errors
        ?.map((e) => ({
          path: e.instancePath,
          rule: e.keyword,
          schema: e.schemaPath,
        }))
        .slice(0, 15),
    }) + '\n',
  )

  const inventory = await fetch(
    'https://api.appfolio.com/api/v0/inventory_locations?filters[LastUpdatedAtFrom]=2026-11-14T06:00:00Z&page[size]=10',
    {
      headers: {
        Authorization: `Bearer ${token.token}`,
        'X-AppFolio-Database-ID': process.env.APPFOLIO_TEST_DATABASE_ID!,
        'X-AppFolio-Developer-ID': process.env.APPFOLIO_TEST_DEVELOPER_ID!,
      },
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    },
  )
  const io = catalog.operations.find((o) => o.name === 'getInventoryLocations')!
  const iv: unknown = await inventory.json()
  const validInventory = ajv.validate(
    io.responses[String(inventory.status)],
    iv,
  )
  process.stdout.write(
    JSON.stringify({
      inventoryStatus: inventory.status,
      validInventory,
      errors: ajv.errors
        ?.map((e) => ({
          path: e.instancePath,
          rule: e.keyword,
          schema: e.schemaPath,
        }))
        .slice(0, 10),
    }) + '\n',
  )
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      oauth: 'failed',
      category: error instanceof Error ? error.message : 'unknown',
    }) + '\n',
  )
  process.exitCode = 1
}
