CREATE TYPE "public"."player_availability" AS ENUM('available', 'bench', 'injured', 'eliminated', 'doubtful');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('upcoming', 'live', 'finished');--> statement-breakpoint
CREATE TABLE "match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"team_a" text NOT NULL,
	"team_b" text NOT NULL,
	"event" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "match_status" DEFAULT 'upcoming' NOT NULL,
	"score_a" integer,
	"score_b" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_distinct_orgs" CHECK ("match"."team_a" <> "match"."team_b"),
	CONSTRAINT "match_score_pairing" CHECK (("match"."score_a" IS NULL) = ("match"."score_b" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "round_player_score" (
	"round_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"points" numeric(6, 1) NOT NULL,
	"price_before_cents" integer NOT NULL,
	"price_after_cents" integer NOT NULL,
	"price_delta_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_player_score_round_id_player_id_pk" PRIMARY KEY("round_id","player_id"),
	CONSTRAINT "round_player_score_delta_consistent" CHECK ("round_player_score"."price_delta_cents" = "round_player_score"."price_after_cents" - "round_player_score"."price_before_cents")
);
--> statement-breakpoint
CREATE TABLE "round_roster" (
	"round_id" uuid NOT NULL,
	"fantasy_team_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"player_id" uuid,
	"captain" boolean DEFAULT false NOT NULL,
	"points" numeric(6, 1) DEFAULT 0 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "round_roster_round_id_fantasy_team_id_position_pk" PRIMARY KEY("round_id","fantasy_team_id","position"),
	CONSTRAINT "round_roster_position_range" CHECK ("round_roster"."position" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "round_team_result" (
	"round_id" uuid NOT NULL,
	"fantasy_team_id" uuid NOT NULL,
	"points" numeric(8, 1) NOT NULL,
	"balance_cents" integer NOT NULL,
	"squad_value_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_team_result_round_id_fantasy_team_id_pk" PRIMARY KEY("round_id","fantasy_team_id")
);
--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "availability" "player_availability" DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "availability_note" text;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_player_score" ADD CONSTRAINT "round_player_score_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_player_score" ADD CONSTRAINT "round_player_score_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_roster" ADD CONSTRAINT "round_roster_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_roster" ADD CONSTRAINT "round_roster_fantasy_team_id_fantasy_team_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_roster" ADD CONSTRAINT "round_roster_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_team_result" ADD CONSTRAINT "round_team_result_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_team_result" ADD CONSTRAINT "round_team_result_fantasy_team_id_fantasy_team_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_round_scheduled_idx" ON "match" USING btree ("round_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "round_player_score_points_idx" ON "round_player_score" USING btree ("round_id","points" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "round_player_score_delta_idx" ON "round_player_score" USING btree ("round_id","price_delta_cents" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "round_team_result_points_idx" ON "round_team_result" USING btree ("round_id","points" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "round_team_result_team_idx" ON "round_team_result" USING btree ("fantasy_team_id");