import { desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { match, player, playerMatchStat } from "@/db/schema";
import type { PlayerMatchPerformance } from "@/lib/player/types";
import type { Querier } from "@/lib/team/queries";

/**
 * Leituras por jogador — primitivas nomeadas e mockáveis, no mesmo espírito de
 * `lib/round/queries.ts`: nunca uma cadeia `select().from().where()` montada
 * dentro da página ou da action.
 */

/**
 * Teto de sanidade. Cinco jogadores nunca chegam perto — a guarda existe para
 * que uma escalação com histórico de uma temporada inteira não vire uma
 * consulta ilimitada.
 */
const PERFORMANCE_ROW_LIMIT = 200;

/**
 * O que cada jogador fez em cada **série** que disputou, da mais recente para
 * a mais antiga.
 *
 * `player_match_stat` guarda uma linha por mapa; a série é a agregação dessas
 * linhas, e é ela que o usuário lê ("o jogo de ontem"). Somar pontos e abates
 * e tirar a média de ACS e rating é exatamente o recorte que o scoreboard do
 * vlr apresenta ao final de uma partida.
 *
 * `groupBy(player.id, match.id)` bate no `player_match_stat_player_idx`
 * `(playerId, matchId)` — o índice que o plano 08 criou com o comentário "o
 * histórico do jogador", e que até agora ninguém usava.
 */
export async function listRosterPerformances(
  playerIds: readonly string[],
  q: Querier = db,
): Promise<PlayerMatchPerformance[]> {
  // Escalação vazia é o estado de todo time novo: não custa uma consulta.
  if (playerIds.length === 0) return [];

  const rows = await q
    .select({
      playerId: player.id,
      nickname: player.nickname,
      team: player.team,
      photoUrl: player.photoUrl,
      matchId: match.id,
      event: match.event,
      scheduledAt: match.scheduledAt,
      teamA: match.teamA,
      teamB: match.teamB,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      status: match.status,
      // `fantasyPoints` é `NOT NULL DEFAULT 0`: a soma sempre existe.
      points: sql<number>`sum(${playerMatchStat.fantasyPoints})::float8`,
      // Já `kills`/`deaths`/`assists`/`acs`/`rating` são anuláveis, e `sum`/`avg`
      // só devolvem `null` quando **nenhum** mapa da série trouxe o número.
      // Sem `coalesce`, portanto: "o scoreboard não veio" não é "zerou", e a
      // diferença é o que impede um K/D falso de 0.00 no gráfico.
      kills: sql<number | null>`sum(${playerMatchStat.kills})::int`,
      deaths: sql<number | null>`sum(${playerMatchStat.deaths})::int`,
      assists: sql<number | null>`sum(${playerMatchStat.assists})::int`,
      acs: sql<number | null>`avg(${playerMatchStat.acs})::float8`,
      rating: sql<number | null>`avg(${playerMatchStat.rating})::float8`,
      mapsWon: sql<number>`sum(case when ${playerMatchStat.won} then 1 else 0 end)::int`,
      mapsPlayed: sql<number>`count(*)::int`,
    })
    .from(playerMatchStat)
    .innerJoin(match, eq(match.id, playerMatchStat.matchId))
    .innerJoin(player, eq(player.id, playerMatchStat.playerId))
    .where(inArray(playerMatchStat.playerId, [...playerIds]))
    .groupBy(player.id, match.id)
    // O desempate mantém a ordem estável entre requests: duas séries no mesmo
    // horário sairiam em ordem indefinida do Postgres, e o eixo do gráfico
    // dançaria sozinho a cada recarga.
    .orderBy(desc(match.scheduledAt), desc(match.id))
    .limit(PERFORMANCE_ROW_LIMIT);

  return rows;
}
