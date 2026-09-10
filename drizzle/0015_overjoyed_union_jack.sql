CREATE TYPE "public"."vlr_job_health_status" AS ENUM('ok', 'failed');--> statement-breakpoint
CREATE TABLE "vlr_job_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"last_status" "vlr_job_health_status",
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_duration_ms" integer,
	"last_summary" text,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vlr_page_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"content_hash" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"changed_at" timestamp with time zone,
	"unchanged_runs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "roster_missing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vlr_event" ADD COLUMN "tracked_override" boolean;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "revalidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "missing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "vlr_job_health_job_uidx" ON "vlr_job_health" USING btree ("job");--> statement-breakpoint
CREATE UNIQUE INDEX "vlr_page_state_path_uidx" ON "vlr_page_state" USING btree ("path");--> statement-breakpoint
CREATE INDEX "match_dismissed_idx" ON "match" USING btree ("dismissed_at") WHERE "match"."dismissed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "match_revalidated_scraped_idx" ON "match" USING btree ("revalidated_at","scraped_at");