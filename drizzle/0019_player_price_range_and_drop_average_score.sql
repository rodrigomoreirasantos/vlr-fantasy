ALTER TABLE "player" DROP CONSTRAINT "player_price_cents_positive";--> statement-breakpoint
ALTER TABLE "fantasy_team" DROP CONSTRAINT "fantasy_team_balance_non_negative";--> statement-breakpoint
ALTER TABLE "player" DROP COLUMN "average_score";--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_price_cents_range" CHECK ("player"."price_cents" BETWEEN 2000 AND 9000);--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD CONSTRAINT "fantasy_team_balance_range" CHECK ("fantasy_team"."balance_cents" BETWEEN 0 AND 36000);