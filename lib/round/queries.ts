import { and, asc, desc, eq, gt, lt } from "drizzle-orm";

import { db } from "@/db";
import {
  match,
  player,
  round,
  roundPlayerScore,
  roundRoster,
  roundTeamResult,
} from "@/db/schema";
import type {
  PriceMover,
  RoundMatch,
  RoundRosterEntry,
  RoundScorer,
  RoundTeamResult,
} from "@/lib/round/types";
import type { Querier } from "@/lib/team/queries";

/**
 * Primitivas nomeadas de leitura de rodada — no mesmo espírito de
 * `lib/championship/queries.ts`: cada uma mockável individualmente, nunca
 * uma cadeia `select().from().where()` montada dentro da página ou da action.
 */

/** A "rodada fechada" da Home — a `finished` de maior número. */
export async function getLatestFinishedRound(q: Querier = db) {
  return q.query.round.findFirst({
    where: eq(round.status, "finished"),
    orderBy: (row, { desc }) => [desc(row.number)],
  });
}

/**
 * A rodada "que vem" da Home: a `active`. Fechar uma rodada promove a
 * `upcoming` de menor número a `active` na mesma transação
 * (`db/close-round.ts`) — então é ela, não uma `upcoming` parada, quem tem o
 * mercado aberto e o calendário que o usuário precisa acompanhar agora.
 *
 * O fallback cobre o estado degenerado em que não há rodada `active` (só um
 * ajuste manual no banco produz isso): a `upcoming` de menor número ainda é a
 * próxima rodada do usuário, e é melhor mostrá-la do que dizer que não há
 * rodada agendada tendo rodadas na tabela.
 */
export async function getNextRound(q: Querier = db) {
  const active = await q.query.round.findFirst({
    where: eq(round.status, "active"),
  });
  if (active) return active;

  return q.query.round.findFirst({
    where: eq(round.status, "upcoming"),
    orderBy: (row, { asc }) => [asc(row.number)],
  });
}

/** A rodada de um número específico — usada para achar "a rodada anterior" de uma rodada fechada. */
export async function getRoundByNumber(number: number, q: Querier = db) {
  return q.query.round.findFirst({ where: eq(round.number, number) });
}

export async function listRoundMatches(
  roundId: string,
  q: Querier = db,
): Promise<RoundMatch[]> {
  const rows = await q.query.match.findMany({
    where: eq(match.roundId, roundId),
    orderBy: (row, { asc }) => [asc(row.scheduledAt)],
  });

  return rows.map((row) => ({
    id: row.id,
    teamA: row.teamA,
    teamB: row.teamB,
    event: row.event,
    scheduledAt: row.scheduledAt,
    status: row.status,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
  }));
}

export async function getTeamRoundResult(
  fantasyTeamId: string,
  roundId: string,
  q: Querier = db,
): Promise<RoundTeamResult | null> {
  const row = await q.query.roundTeamResult.findFirst({
    where: and(
      eq(roundTeamResult.fantasyTeamId, fantasyTeamId),
      eq(roundTeamResult.roundId, roundId),
    ),
  });
  if (!row) return null;

  return {
    points: row.points,
    balanceCents: row.balanceCents,
    squadValueCents: row.squadValueCents,
  };
}

/** As cinco vagas congeladas de um time numa rodada — `[]` sem snapshot ainda. */
export async function listRoundRoster(
  fantasyTeamId: string,
  roundId: string,
  q: Querier = db,
): Promise<RoundRosterEntry[]> {
  const rows = await q.query.roundRoster.findMany({
    where: and(
      eq(roundRoster.fantasyTeamId, fantasyTeamId),
      eq(roundRoster.roundId, roundId),
    ),
    orderBy: (row, { asc }) => [asc(row.position)],
    with: { player: true },
  });

  return rows.map((row) => ({
    position: row.position,
    player: row.player
      ? {
          id: row.player.id,
          nickname: row.player.nickname,
          team: row.player.team,
        }
      : null,
    captain: row.captain,
    points: row.points,
    priceCents: row.priceCents,
  }));
}

/** Maiores pontuadores do jogo inteiro na rodada — usa `round_player_score_points_idx`. */
export async function getTopRoundScorers(
  roundId: string,
  limit: number,
  q: Querier = db,
): Promise<RoundScorer[]> {
  return q
    .select({
      playerId: player.id,
      nickname: player.nickname,
      team: player.team,
      role: player.role,
      points: roundPlayerScore.points,
    })
    .from(roundPlayerScore)
    .innerJoin(player, eq(player.id, roundPlayerScore.playerId))
    .where(eq(roundPlayerScore.roundId, roundId))
    .orderBy(desc(roundPlayerScore.points))
    .limit(limit);
}

/** Maiores valorizações e desvalorizações da rodada — usa `round_player_score_delta_idx`. */
export async function getRoundPriceMovers(
  roundId: string,
  limit: number,
  q: Querier = db,
): Promise<{ risers: PriceMover[]; fallers: PriceMover[] }> {
  const columns = {
    playerId: player.id,
    nickname: player.nickname,
    team: player.team,
    role: player.role,
    priceDeltaCents: roundPlayerScore.priceDeltaCents,
  };

  // O filtro de sinal não é cosmético: sem ele, uma rodada com pouca
  // movimentação lista jogadores com delta `0` (ou até negativo) como
  // "maiores valorizações", e o mesmo jogador pode aparecer nas duas listas.
  // O estado vazio de `<PriceMoverList>` é a resposta certa nesse caso.
  const [risers, fallers] = await Promise.all([
    q
      .select(columns)
      .from(roundPlayerScore)
      .innerJoin(player, eq(player.id, roundPlayerScore.playerId))
      .where(
        and(
          eq(roundPlayerScore.roundId, roundId),
          gt(roundPlayerScore.priceDeltaCents, 0),
        ),
      )
      .orderBy(desc(roundPlayerScore.priceDeltaCents))
      .limit(limit),
    q
      .select(columns)
      .from(roundPlayerScore)
      .innerJoin(player, eq(player.id, roundPlayerScore.playerId))
      .where(
        and(
          eq(roundPlayerScore.roundId, roundId),
          lt(roundPlayerScore.priceDeltaCents, 0),
        ),
      )
      .orderBy(asc(roundPlayerScore.priceDeltaCents))
      .limit(limit),
  ]);

  return { risers, fallers };
}
