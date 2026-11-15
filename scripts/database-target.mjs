const { URL } = globalThis

function endpoint(url) {
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Expected a PostgreSQL connection')
  return url.hostname.replace(/-pooler(?=\.)/, '')
}

export function migrationTarget({
  environment,
  connection,
  direct,
  productionEndpoint,
}) {
  let pooled, target
  try {
    pooled = new URL(connection)
    target = new URL(direct || connection)
  } catch {
    throw new Error('Database connection is missing or invalid')
  }
  if (
    endpoint(pooled) !== endpoint(target) ||
    pooled.pathname !== target.pathname
  )
    throw new Error(
      'Pooled and direct database URLs must identify the same branch and database',
    )
  if (environment === 'preview' || environment === 'production') {
    if (!/^ep-[a-z0-9-]+$/.test(productionEndpoint ?? ''))
      throw new Error('NEON_PRODUCTION_ENDPOINT_ID must be configured')
    const host = endpoint(target)
    if (!host.endsWith('.neon.tech'))
      throw new Error('Vercel databases must use the configured Neon project')
    const name = host.split('.')[0]
    const production =
      name === productionEndpoint || name.startsWith(productionEndpoint + '-')
    if (production !== (environment === 'production'))
      throw new Error(
        'Database branch does not match the deployment environment',
      )
  }
  return target.href
}

// A new PR branch inherits production rows, including encrypted signing keys.
// Start it with fresh app/auth state once; preserve test data on later builds.
export async function initializePreview(pool) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock(194826031)')
    await client.query(
      'create table if not exists appfolio_preview_initialized (id boolean primary key default true check (id), initialized_at timestamptz not null default now())',
    )
    const marker = await client.query(
      'select id from appfolio_preview_initialized where id=true',
    )
    if (!marker.rows.length) {
      await client.query(
        'truncate appfolio_retry, appfolio_job, appfolio_grant, appfolio_connection, "oauthAccessToken", "oauthRefreshToken", "oauthConsent", "oauthClientAssertion", "oauthClientResource", "oauthResource", "oauthClient", session, account, verification, jwks, "user", "rateLimit" cascade',
      )
      await client.query(
        'insert into appfolio_preview_initialized (id) values (true)',
      )
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
