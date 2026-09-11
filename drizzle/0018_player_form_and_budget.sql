ALTER TABLE "fantasy_team" ALTER COLUMN "balance_cents" SET DEFAULT 30000;--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "form_points" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "round_team_result" ADD COLUMN "budget_trimmed_cents" integer DEFAULT 0 NOT NULL;