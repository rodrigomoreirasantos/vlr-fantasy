DROP INDEX "player_match_stat_unique_uidx";--> statement-breakpoint
ALTER TABLE "player_match_stat" ALTER COLUMN "game_vlr_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "player_match_stat_game_uidx" ON "player_match_stat" USING btree ("match_id","player_id","game_vlr_id");