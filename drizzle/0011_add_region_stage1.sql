CREATE TYPE "public"."event_region" AS ENUM('international', 'americas', 'emea', 'pacific', 'china', 'other');--> statement-breakpoint
CREATE TABLE "fantasy_identity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"crest_shape" text DEFAULT 'shield' NOT NULL,
	"crest_symbol" text DEFAULT 'crosshair' NOT NULL,
	"crest_bg" text DEFAULT 'graphite' NOT NULL,
	"crest_fg" text DEFAULT 'red' NOT NULL,
	"crest_border" text DEFAULT 'red' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "region" "event_region" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "region_source_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD COLUMN "region" "event_region" NOT NULL;--> statement-breakpoint
ALTER TABLE "championship" ADD COLUMN "region" "event_region" NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_identity" ADD CONSTRAINT "fantasy_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_identity_name_uidx" ON "fantasy_identity" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "player_region_role_active_idx" ON "player" USING btree ("region","role","active");--> statement-breakpoint
CREATE INDEX "player_team_idx" ON "player" USING btree ("team");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_team_user_region_uidx" ON "fantasy_team" USING btree ("user_id","region");--> statement-breakpoint
CREATE INDEX "championship_region_idx" ON "championship" USING btree ("region");--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_region_not_international" CHECK ("player"."region" <> 'international');--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD CONSTRAINT "fantasy_team_region_is_team" CHECK ("fantasy_team"."region" <> 'other');--> statement-breakpoint
ALTER TABLE "championship" ADD CONSTRAINT "championship_region_is_team" CHECK ("championship"."region" <> 'other');