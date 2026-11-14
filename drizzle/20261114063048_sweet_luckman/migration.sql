CREATE TABLE "appfolio_job" (
	"id" text PRIMARY KEY,
	"grant_id" text NOT NULL,
	"upstream_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appfolio_connection" ADD COLUMN "jobs_poll_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appfolio_job" ADD CONSTRAINT "appfolio_job_grant_id_appfolio_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "appfolio_grant"("id");