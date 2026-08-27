CREATE TYPE "public"."championship_member_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "championship" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "championship_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "championship_member_status" DEFAULT 'pending' NOT NULL,
	"invited_by_id" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;--> statement-breakpoint
ALTER TABLE "championship" ADD CONSTRAINT "championship_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_member" ADD CONSTRAINT "championship_member_championship_id_championship_id_fk" FOREIGN KEY ("championship_id") REFERENCES "public"."championship"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_member" ADD CONSTRAINT "championship_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_member" ADD CONSTRAINT "championship_member_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "championship_owner_idx" ON "championship" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "championship_member_unique_uidx" ON "championship_member" USING btree ("championship_id","user_id");--> statement-breakpoint
CREATE INDEX "championship_member_user_status_idx" ON "championship_member" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");