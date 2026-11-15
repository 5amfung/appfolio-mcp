import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'

export const connections = pgTable(
  'appfolio_connection',
  {
    id: text().primaryKey(),
    userId: text('user_id').notNull(),
    name: text().notNull(),
    credentials: text().notNull(),
    identifierHint: text('identifier_hint')
      .notNull()
      .default('Credentials saved'),
    version: integer().notNull().default(1),
    token: text(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    leaseId: text('lease_id'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    jobsPollAfter: timestamp('jobs_poll_after', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('connection_owner_identity').on(t.id, t.userId),
    index('connection_owner').on(t.userId),
  ],
)

export const grants = pgTable(
  'appfolio_grant',
  {
    id: text().primaryKey(),
    userId: text('user_id').notNull(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    clientId: text('client_id').notNull(),
    clientName: text('client_name').notNull(),
    requestHash: text('request_hash').notNull().unique(),
    sessionId: text('session_id').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('grant_owner').on(t.userId),
    index('grant_connection').on(t.connectionId),
  ],
)

export const retries = pgTable('appfolio_retry', {
  id: text().primaryKey(),
  grantId: text('grant_id')
    .notNull()
    .references(() => grants.id),
  operation: text().notNull(),
  fingerprint: text().notNull(),
  body: text().notNull(),
  contentType: text('content_type').notNull(),
  upstreamKey: text('upstream_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const jobs = pgTable('appfolio_job', {
  id: text().primaryKey(),
  grantId: text('grant_id')
    .notNull()
    .references(() => grants.id),
  upstreamId: text('upstream_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
