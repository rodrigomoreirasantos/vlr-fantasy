import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { match, player, playerMatchStat } from "@/db/schema";
import { listPlayerFormPoints } from "@/lib/round/queries";
import { targetPriceCents } from "@/lib/scoring/pricing";
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
    // Partida descartada (Decisão 6, plano 17) nunca terá `scrapedAt` — sem
    // este filtro, um card cancelado travaria a rodada para sempre.
    .where(and(eq(match.roundId, activeRound.id), isNull(match.dismissedAt)));

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
 * Recalcula `formPoints` (média das últimas 5 séries, `listPlayerFormPoints`)
 * e `gamesPlayed` (rodadas distintas em que o jogador pontuou) de todo o
 * catálogo — **nunca mexe em preço** (Fase 2, `.claude/plans/20-preco-dos-jogadores-e-orcamento.md`).
 *
 * A separação de `rebasePlayerPrices` é a decisão que sustenta esta fase: o
 * preço não pode andar no meio de uma rodada aberta (o usuário compra e vende
 * na janela de mercado, `evaluateSubstitution`), então só quem reprecifica é
 * `rebasePlayerPrices` (rebase de manutenção, fora de rodada) ou
 * `closeActiveRound` (fechamento, com passo).
 *
 * Chamada **uma vez por lote** — ao fim de `workQueue` e depois de
 * `reprocessMatch` (`scripts/vlr/reprocess.ts`) — nunca por partida: a
 * consulta varre o catálogo inteiro, e chamá-la por partida faria N vezes o
 * mesmo trabalho.
 *
 * Um único `UPDATE` com `CASE` por coluna, não um `UPDATE` por jogador
 * (fato 12 do plano 20: esta função passou a rodar a cada lote, não mais só
 * numa carga histórica).
 */
export async function refreshPlayerForm(
  tx: Transaction,
): Promise<{ players: number }> {
  const [formByPlayer, gamesRows] = await Promise.all([
    listPlayerFormPoints(tx),
    tx
      .select({
        playerId: playerMatchStat.playerId,
        rounds: sql<number>`count(distinct ${match.roundId})::int`,
        matches: sql<number>`count(distinct ${playerMatchStat.matchId})::int`,
      })
      .from(playerMatchStat)
      .innerJoin(match, eq(match.id, playerMatchStat.matchId))
      .groupBy(playerMatchStat.playerId),
  ]);

  if (gamesRows.length === 0) return { players: 0 };

  const rows = gamesRows.map((row) => ({
    playerId: row.playerId,
    // Partidas, não rodadas, quando a partida ainda não pertence a nenhuma:
    // o backfill roda antes de `syncRoundsFromMatches` ter o que agrupar.
    games: Math.max(row.rounds, row.matches, 1),
    form: formByPlayer.get(row.playerId) ?? null,
  }));

  const gamesCase = sql.join(
    rows.map(
      (row) => sql`when ${player.id} = ${row.playerId} then ${row.games}::int`,
    ),
    sql` `,
  );
  const formCase = sql.join(
    rows.map((row) =>
      row.form === null
        ? sql`when ${player.id} = ${row.playerId} then null`
        : sql`when ${player.id} = ${row.playerId} then ${row.form}::numeric`,
    ),
    sql` `,
  );

  await tx
    .update(player)
    .set({
      gamesPlayed: sql`case ${gamesCase} else ${player.gamesPlayed} end`,
      formPoints: sql`case ${formCase} else ${player.formPoints} end`,
    })
    .where(
      inArray(
        player.id,
        rows.map((row) => row.playerId),
      ),
    );

  logInfo("vlr.players.form_refreshed", { players: rows.length });
  return { players: rows.length };
}

/**
 * Rebase de manutenção: leva `priceCents` direto ao alvo pela forma
 * (`targetPriceCents`), **sem passo** — é um recomeço de escala, não uma
 * rodada. Só dois chamadores: `backfill()` (abaixo) e `pnpm db:reprice`
 * (Fase 3 do plano 20). O fechamento normal de rodada usa `nextPriceCents`,
 * que desde o plano 26 (`.claude/plans/26-regras-de-preco-e-saldo.md`)
 * compara o jogo real da rodada contra `expectedSeriesPoints` — não caminha
 * mais até o alvo pela forma. `targetPriceCents` continua servindo só à
 * estreia e a este rebase.
 */
export async function rebasePlayerPrices(
  tx: Transaction,
): Promise<{ players: number }> {
  const rows = await tx
    .select({ id: player.id, formPoints: player.formPoints })
    .from(player);

  for (const row of rows) {
    await tx
      .update(player)
      .set({ priceCents: targetPriceCents(row.formPoints) })
      .where(eq(player.id, row.id));
  }

  logInfo("vlr.players.prices_rebased", { players: rows.length });
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
