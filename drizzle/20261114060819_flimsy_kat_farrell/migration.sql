CREATE TABLE "appfolio_connection" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"credentials" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"token" text,
	"expires_at" timestamp with time zone,
	"lease_id" text,
	"lease_until" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appfolio_grant" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"request_hash" text NOT NULL UNIQUE,
	"session_id" text NOT NULL,
	"approved_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appfolio_retry" (
	"id" text PRIMARY KEY,
	"grant_id" text NOT NULL,
	"operation" text NOT NULL,
	"fingerprint" text NOT NULL,
	"body" text NOT NULL,
	"content_type" text NOT NULL,
	"upstream_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "connection_owner_identity" ON "appfolio_connection" ("id","user_id");--> statement-breakpoint
CREATE INDEX "connection_owner" ON "appfolio_connection" ("user_id");--> statement-breakpoint
CREATE INDEX "grant_owner" ON "appfolio_grant" ("user_id");--> statement-breakpoint
CREATE INDEX "grant_connection" ON "appfolio_grant" ("connection_id");--> statement-breakpoint
ALTER TABLE "appfolio_grant" ADD CONSTRAINT "appfolio_grant_connection_id_appfolio_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "appfolio_connection"("id");--> statement-breakpoint
ALTER TABLE "appfolio_retry" ADD CONSTRAINT "appfolio_retry_grant_id_appfolio_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "appfolio_grant"("id");