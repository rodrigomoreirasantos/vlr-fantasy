-- "Um time por região" (.claude/plans/10-time-por-regiao.md, decisão 4):
-- reset deliberado. O app ainda está em desenvolvimento — nenhum elenco
-- misturado de região sobrevive à migração, e nenhum campeonato sem região
-- (championship.region é NOT NULL sem default honesto logo a seguir)
-- significa nada sem o histórico que o sustentava.
--
-- Um DELETE só em fantasy_team: cascateia roster_slot, transfer,
-- round_roster e round_team_result (todas "on delete cascade" de
-- fantasy_team_id). Os nomes e brasões que os usuários escolheram também se
-- perdem — renascem de deriveTeamName(@login) via ensureFantasyTeam.
DELETE FROM "fantasy_team";
--> statement-breakpoint
-- championship_member cascateia junto.
DELETE FROM "championship";
