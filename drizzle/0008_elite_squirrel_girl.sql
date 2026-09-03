CREATE TYPE "public"."vlr_job_status" AS ENUM('pending', 'running', 'done', 'failed', 'dead');--> statement-breakpoint
CREATE TABLE "vlr_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vlr_id" text NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'unknown' NOT NULL,
	"tracked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vlr_job_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"key" text NOT NULL,
	"status" "vlr_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vlr_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vlr_id" text NOT NULL,
	"name" text NOT NULL,
	"tag" text,
	"region" text,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_match_stat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"map_name" text NOT NULL,
	"game_vlr_id" text,
	"agent" text,
	"rating" numeric(5, 2),
	"acs" integer,
	"kills" integer,
	"deaths" integer,
	"assists" integer,
	"kast" integer,
	"adr" integer,
	"headshot_pct" integer,
	"first_kills" integer,
	"first_deaths" integer,
	"won" boolean DEFAULT false NOT NULL,
	"fantasy_points" numeric(6, 1) DEFAULT 0 NOT NULL,
	"scout_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_match_stat_kills_non_negative" CHECK ("player_match_stat"."kills" IS NULL OR "player_match_stat"."kills" >= 0),
	CONSTRAINT "player_match_stat_deaths_non_negative" CHECK ("player_match_stat"."deaths" IS NULL OR "player_match_stat"."deaths" >= 0)
);
--> statement-breakpoint
ALTER TABLE "match" DROP CONSTRAINT "match_round_id_round_id_fk";
--> statement-breakpoint
ALTER TABLE "match" ALTER COLUMN "round_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "vlr_id" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "real_name" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "games_played" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "average_score" numeric(6, 1) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "round" ADD COLUMN "week_key" text;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "vlr_id" text;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "best_of" integer;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "scraped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "raw_html_path" text;--> statement-breakpoint
ALTER TABLE "player_match_stat" ADD CONSTRAINT "player_match_stat_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stat" ADD CONSTRAINT "player_match_stat_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vlr_event_vlr_id_uidx" ON "vlr_event" USING btree ("vlr_id");--> statement-breakpoint
CREATE INDEX "vlr_event_tracked_idx" ON "vlr_event" USING btree ("tracked");--> statement-breakpoint
CREATE UNIQUE INDEX "vlr_job_run_job_key_uidx" ON "vlr_job_run" USING btree ("job","key");--> statement-breakpoint
CREATE INDEX "vlr_job_run_claim_idx" ON "vlr_job_run" USING btree ("job","status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "vlr_team_vlr_id_uidx" ON "vlr_team" USING btree ("vlr_id");--> statement-breakpoint
CREATE INDEX "vlr_team_name_idx" ON "vlr_team" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "player_match_stat_unique_uidx" ON "player_match_stat" USING btree ("match_id","player_id","map_name");--> statement-breakpoint
CREATE INDEX "player_match_stat_player_idx" ON "player_match_stat" USING btree ("player_id","match_id");--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_event_id_vlr_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."vlr_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_vlr_id_uidx" ON "player" USING btree ("vlr_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_week_key_uidx" ON "round" USING btree ("week_key");--> statement-breakpoint
CREATE UNIQUE INDEX "match_vlr_id_uidx" ON "match" USING btree ("vlr_id");--> statement-breakpoint
CREATE INDEX "match_scraped_idx" ON "match" USING btree ("status","scraped_at");