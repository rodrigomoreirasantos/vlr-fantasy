CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "friendship" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a_id" text NOT NULL,
	"user_b_id" text NOT NULL,
	"requester_id" text NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD COLUMN "crest_shape" text DEFAULT 'shield' NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD COLUMN "crest_symbol" text DEFAULT 'crosshair' NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD COLUMN "crest_bg" text DEFAULT 'graphite' NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD COLUMN "crest_fg" text DEFAULT 'red' NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD COLUMN "crest_border" text DEFAULT 'red' NOT NULL;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_user_a_id_user_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_user_b_id_user_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friendship_pair_uidx" ON "friendship" USING btree ("user_a_id","user_b_id");--> statement-breakpoint
CREATE INDEX "friendship_user_a_status_idx" ON "friendship" USING btree ("user_a_id","status");--> statement-breakpoint
CREATE INDEX "friendship_user_b_status_idx" ON "friendship" USING btree ("user_b_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_team_name_uidx" ON "fantasy_team" USING btree (lower(btrim("name")));