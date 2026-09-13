ALTER TABLE "fantasy_team" DROP CONSTRAINT "fantasy_team_balance_range";--> statement-breakpoint
ALTER TABLE "round_team_result" DROP COLUMN "budget_trimmed_cents";--> statement-breakpoint
ALTER TABLE "fantasy_team" ADD CONSTRAINT "fantasy_team_balance_non_negative" CHECK ("fantasy_team"."balance_cents" >= 0);