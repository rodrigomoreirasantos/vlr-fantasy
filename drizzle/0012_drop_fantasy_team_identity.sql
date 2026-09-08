DROP INDEX "fantasy_team_user_uidx";--> statement-breakpoint
DROP INDEX "fantasy_team_name_uidx";--> statement-breakpoint
ALTER TABLE "fantasy_team" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "fantasy_team" DROP COLUMN "crest_shape";--> statement-breakpoint
ALTER TABLE "fantasy_team" DROP COLUMN "crest_symbol";--> statement-breakpoint
ALTER TABLE "fantasy_team" DROP COLUMN "crest_bg";--> statement-breakpoint
ALTER TABLE "fantasy_team" DROP COLUMN "crest_fg";--> statement-breakpoint
ALTER TABLE "fantasy_team" DROP COLUMN "crest_border";