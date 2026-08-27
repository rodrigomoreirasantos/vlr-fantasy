ALTER TABLE "transfer" ALTER COLUMN "in_player_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer" ALTER COLUMN "in_price_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_has_player" CHECK ("transfer"."in_player_id" IS NOT NULL OR "transfer"."out_player_id" IS NOT NULL);