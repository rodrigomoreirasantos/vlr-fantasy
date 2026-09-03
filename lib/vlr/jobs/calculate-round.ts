import { eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { match, player, playerMatchStat } from "@/db/schema";
import { MIN_PRICE_CENTS, PRICE_PER_POINT_CENTS } from "@/lib/scoring/pricing";
import { logInfo } from "@/lib/vlr/http/log";
import type { Transaction } from "@/lib/team/queries";
import { getActiveRound } from "@/lib/team/queries";
import { closeActiveRound } from "@/db/close-round";
import { refreshRoundMatchCounts } from "@/lib/vlr/persist/rounds";

/**
 * Estatísticas de uma rodada → `player.score`.
 *
 * **Atribuição, nunca `+=`** — é exatamente o que torna recalcular seguro:
 * rodar duas vezes dá o mesmo número, e corrigir uma regra de scout é
 * reprocessar e recalcular, não fazer conta de diferença. Quem não jogou a
 * rodada volta a zero pelo mesmo motivo.
 *
 * Daqui para frente o fluxo já existente assume: `closeActiveRound` congela os
 * snapshots, reprecifica com `nextPriceCents` e promove a próxima rodada.
 * Nenhuma regra de virada é reescrita.
 */
export async function calculateRound(
  tx: Transaction,
  roundId: string,
): Promise<{ scoredPlayers: number; totalPoints: number }> {
  const rows = await tx
    .select({
      playerId: playerMatchStat.playerId,
      points: sql<number>`sum(${playerMatchStat.fantasyPoints})::float8`,
    })
    .from(playerMatchStat)
    .innerJoin(match, eq(match.id, playerMatchStat.matchId))
    .where(eq(match.roundId, roundId))
    .groupBy(playerMatchStat.playerId);

  await tx.update(player).set({ score: 0 });

  let totalPoints = 0;
  for (const row of rows) {
    const points = Math.round(row.points * 10) / 10;
    totalPoints += points;
    await tx
      .update(player)
      .set({ score: points })
      .where(eq(player.id, row.playerId));
  }

  await refreshRoundMatchCounts(tx, roundId);

  logInfo("vlr.round.calculated", {
    roundId,
    scoredPlayers: rows.length,
    totalPoints,
  });
  return { scoredPlayers: rows.length, totalPoints };
}

/**
 * O job do cron: se **toda** partida da rodada ativa já foi extraída, pontua e
 * fecha a rodada. Enquanto faltar uma partida, não faz nada — fechar cedo
 * congelaria snapshots incompletos, e eles são imutáveis.
 */
export async function runRoundJob(): Promise<
  | { status: "no-active-round" }
  | { status: "waiting"; pending: number }
  | { status: "closed"; scoredPlayers: number; closedRoundId: string }
> {
  const activeRound = await getActiveRound();
  if (!activeRound) return { status: "no-active-round" };

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${match.scrapedAt} is null)::int`,
    })
    .from(match)
    .where(eq(match.roundId, activeRound.id));

  if (!counts || counts.total === 0 || counts.pending > 0) {
    const pending = counts?.pending ?? 0;
    logInfo("vlr.round.waiting", { roundId: activeRound.id, pending });
    return { status: "waiting", pending };
  }

  return db.transaction(async (tx) => {
    const { scoredPlayers } = await calculateRound(tx, activeRound.id);
    const closed = await closeActiveRound(tx);
    return {
      status: "closed" as const,
      scoredPlayers,
      closedRoundId: closed?.closedRoundId ?? activeRound.id,
    };
  });
}

/**
 * Recalcula `gamesPlayed` (rodadas distintas em que o jogador pontuou) e
 * `averageScore` a partir de todo o histórico de `player_match_stat`, e deriva
 * daí o preço de quem ainda está no preço de nascimento.
 *
 * É o passo final do backfill: sem ele o catálogo inteiro custaria o piso, e o
 * amortecimento de `dampingFactor` não teria em que se apoiar.
 */
export async function refreshPlayerAggregates(
  tx: Transaction,
): Promise<{ players: number }> {
  const rows = await tx
    .select({
      playerId: playerMatchStat.playerId,
      rounds: sql<number>`count(distinct ${match.roundId})::int`,
      matches: sql<number>`count(distinct ${playerMatchStat.matchId})::int`,
      total: sql<number>`sum(${playerMatchStat.fantasyPoints})::float8`,
    })
    .from(playerMatchStat)
    .innerJoin(match, eq(match.id, playerMatchStat.matchId))
    .groupBy(playerMatchStat.playerId);

  for (const row of rows) {
    // Partidas, não rodadas, quando a partida ainda não pertence a nenhuma:
    // o backfill roda antes de `syncRoundsFromMatches` ter o que agrupar.
    const games = Math.max(row.rounds, row.matches, 1);
    const average = Math.round((row.total / games) * 10) / 10;

    // O preço inicial só é derivado para quem ainda está no preço de
    // nascimento (o piso): reprecificar quem já passou por um fechamento de
    // rodada apagaria a valorização que o jogador conquistou.
    const derivedPriceCents = Math.max(
      MIN_PRICE_CENTS,
      Math.round(average * PRICE_PER_POINT_CENTS),
    );

    await tx
      .update(player)
      .set({
        gamesPlayed: games,
        averageScore: average,
        priceCents: sql`case when ${player.priceCents} = ${MIN_PRICE_CENTS}
          then ${derivedPriceCents} else ${player.priceCents} end`,
      })
      .where(eq(player.id, row.playerId));
  }

  logInfo("vlr.players.aggregated", { players: rows.length });
  return { players: rows.length };
}

/** Partidas já extraídas — o numerador de qualquer métrica de cobertura. */
export async function countScrapedMatches(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(match)
    .where(isNotNull(match.scrapedAt));
  return row?.count ?? 0;
}
