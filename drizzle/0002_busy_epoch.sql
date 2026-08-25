CREATE TYPE "public"."player_role" AS ENUM('Duelista', 'Iniciador', 'Controlador', 'Sentinela');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('upcoming', 'active', 'finished');--> statement-breakpoint
CREATE TABLE "player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nickname" text NOT NULL,
	"team" text NOT NULL,
	"agent" text NOT NULL,
	"role" "player_role" NOT NULL,
	"price_cents" integer NOT NULL,
	"score" numeric(6, 1) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_price_cents_positive" CHECK ("player"."price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "round" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"market_opens_at" timestamp with time zone NOT NULL,
	"market_closes_at" timestamp with time zone NOT NULL,
	"total_matches" integer DEFAULT 0 NOT NULL,
	"scored_matches" integer DEFAULT 0 NOT NULL,
	"status" "round_status" DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_market_window_valid" CHECK ("round"."market_closes_at" > "round"."market_opens_at"),
	CONSTRAINT "round_scored_matches_within_total" CHECK ("round"."scored_matches" BETWEEN 0 AND "round"."total_matches")
);
--> statement-breakpoint
CREATE TABLE "fantasy_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"balance_cents" integer DEFAULT 20000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fantasy_team_balance_non_negative" CHECK ("fantasy_team"."balance_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "roster_slot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fantasy_team_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"player_id" uuid,
	"captain" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_slot_position_range" CHECK ("roster_slot"."position" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fantasy_team_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"roster_slot_id" uuid NOT NULL,
	"out_player_id" uuid,
	"in_player_id" uuid NOT NULL,
	"out_price_cents" integer DEFAULT 0 NOT NULL,
	"in_price_cents" integer NOT NULL,
	"balance_after_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD CONSTRAINT "fantasy_team_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_slot" ADD CONSTRAINT "roster_slot_fantasy_team_id_fantasy_team_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_slot" ADD CONSTRAINT "roster_slot_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_fantasy_team_id_fantasy_team_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_roster_slot_id_roster_slot_id_fk" FOREIGN KEY ("roster_slot_id") REFERENCES "public"."roster_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_out_player_id_player_id_fk" FOREIGN KEY ("out_player_id") REFERENCES "public"."player"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_in_player_id_player_id_fk" FOREIGN KEY ("in_player_id") REFERENCES "public"."player"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_nickname_uidx" ON "player" USING btree ("nickname");--> statement-breakpoint
CREATE INDEX "player_role_active_idx" ON "player" USING btree ("role","active");--> statement-breakpoint
CREATE UNIQUE INDEX "round_number_uidx" ON "round" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "round_single_active_uidx" ON "round" USING btree ("status") WHERE "round"."status" = 'active';--> statement-breakpoint
CREATE INDEX "round_status_idx" ON "round" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_team_user_uidx" ON "fantasy_team" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_slot_team_position_uidx" ON "roster_slot" USING btree ("fantasy_team_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_slot_team_player_uidx" ON "roster_slot" USING btree ("fantasy_team_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_slot_single_captain_uidx" ON "roster_slot" USING btree ("fantasy_team_id") WHERE "roster_slot"."captain";--> statement-breakpoint
CREATE INDEX "roster_slot_player_idx" ON "roster_slot" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "transfer_team_round_idx" ON "transfer" USING btree ("fantasy_team_id","round_id");--> statement-breakpoint
CREATE INDEX "transfer_team_created_idx" ON "transfer" USING btree ("fantasy_team_id","created_at");