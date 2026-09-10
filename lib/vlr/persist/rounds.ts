import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { match, round, vlrEvent } from "@/db/schema";
import { marketClosesAtFor } from "@/lib/market/window";
import type { Transaction } from "@/lib/team/queries";
import { weekKeyOf, weekStartOf } from "@/lib/vlr/normalize/week";

/** Janela mínima de mercado quando o primeiro jogo cai na virada da semana. */
const MIN_MARKET_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SyncedRound = {
  weekKey: string;
  roundId: string;
  created: boolean;
  totalMatches: number;
  scoredMatches: number;
  marketClosesAt: Date;
};

/**
 * Cria/atualiza uma rodada por semana ISO, a partir das partidas de eventos
 * `tracked`, e liga cada partida à sua rodada.
 *
 * **`marketClosesAt` = uma hora antes do primeiro jogo da semana**
 * (`marketClosesAtFor`, `lib/market/window.ts`). É a regra inviolável nº 8, e
 * é toda a integração de que ela precisava: `isMarketOpen` e
 * `evaluateSubstitution` já bloqueiam por `market-closed` — só faltava alguém
 * colocar ali o horário certo.
 *
 * A rodada nasce `upcoming` (ou `finished`, se a semana já passou — ver
 * abaixo): quem promove a `active` continua sendo `closeActiveRound`,
 * preservando o `round_single_active_uidx`.
 */
export async function syncRoundsFromMatches(
  tx: Transaction,
  now: Date = new Date(),
): Promise<SyncedRound[]> {
  const rows = await tx
    .select({
      id: match.id,
      scheduledAt: match.scheduledAt,
      scrapedAt: match.scrapedAt,
    })
    .from(match)
    .innerJoin(vlrEvent, eq(match.eventId, vlrEvent.id))
    // Partida descartada (Decisão 6, plano 17) não conta para `marketClosesAt`
    // nem para o total da rodada — ela pode estar ancorando o kickoff de uma
    // semana num jogo que não vai acontecer.
    .where(and(eq(vlrEvent.tracked, true), isNull(match.dismissedAt)));

  if (rows.length === 0) return [];

  const byWeek = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = weekKeyOf(row.scheduledAt);
    const bucket = byWeek.get(key);
    if (bucket) bucket.push(row);
    else byWeek.set(key, [row]);
  }

  const existingRounds = await tx.select().from(round);
  const byWeekKey = new Map(
    existingRounds
      .filter((row) => row.weekKey)
      .map((row) => [row.weekKey!, row]),
  );
  let nextNumber =
    existingRounds.reduce((max, row) => Math.max(max, row.number), 0) + 1;

  // A semana ISO corrente: tudo antes dela já aconteceu.
  const currentWeekKey = weekKeyOf(now);
  const synced: SyncedRound[] = [];

  // Ordem cronológica: os números das rodadas novas saem em sequência, não na
  // ordem arbitrária em que o Postgres devolveu as partidas.
  for (const weekKey of [...byWeek.keys()].sort()) {
    const weekMatches = byWeek.get(weekKey)!;
    const firstKickoff = weekMatches.reduce(
      (earliest, row) =>
        row.scheduledAt < earliest ? row.scheduledAt : earliest,
      weekMatches[0].scheduledAt,
    );
    const marketClosesAt = marketClosesAtFor(firstKickoff);
    const totalMatches = weekMatches.length;
    const scoredMatches = weekMatches.filter(
      (row) => row.scrapedAt !== null,
    ).length;

    const existing = byWeekKey.get(weekKey);
    let roundId: string;
    let created = false;

    if (existing) {
      // Janela de mercado só se mexe enquanto a rodada não começou. Reescrevê-la
      // numa rodada `active` reabriria (ou fecharia) o mercado no meio do jogo.
      await tx
        .update(round)
        .set(
          existing.status === "upcoming"
            ? {
                marketOpensAt: marketOpensFor(marketClosesAt),
                marketClosesAt,
                totalMatches,
                scoredMatches,
              }
            : { totalMatches, scoredMatches },
        )
        .where(eq(round.id, existing.id));
      roundId = existing.id;
    } else {
      const number = nextNumber;
      nextNumber += 1;
      // Uma semana que já passou nasce `finished`, nunca `upcoming`. O
      // backfill descobre semanas antigas **depois** de rodadas futuras já
      // existirem, e `number` é atribuído na ordem em que a semana aparece,
      // não na cronológica — sem esta linha, `closeActiveRound` promoveria uma
      // rodada de agosto depois de uma de setembro.
      const status = weekKey < currentWeekKey ? "finished" : "upcoming";

      const [inserted] = await tx
        .insert(round)
        .values({
          number,
          name: `Rodada ${number}`,
          weekKey,
          marketOpensAt: marketOpensFor(marketClosesAt),
          marketClosesAt,
          totalMatches,
          scoredMatches,
          status,
        })
        .returning({ id: round.id });
      roundId = inserted.id;
      created = true;
    }

    await tx
      .update(match)
      .set({ roundId })
      .where(
        inArray(
          match.id,
          weekMatches.map((row) => row.id),
        ),
      );

    synced.push({
      weekKey,
      roundId,
      created,
      totalMatches,
      scoredMatches,
      marketClosesAt,
    });
  }

  return synced;
}

/**
 * O mercado abre na segunda-feira da semana. Se o primeiro jogo for cedo
 * demais nessa mesma segunda, recua um dia: o CHECK `round_market_window_valid`
 * exige `closesAt > opensAt`, e uma janela degenerada derrubaria a transação
 * inteira.
 */
function marketOpensFor(marketClosesAt: Date): Date {
  const weekStart = weekStartOf(marketClosesAt);
  if (weekStart < marketClosesAt) return weekStart;
  return new Date(marketClosesAt.getTime() - MIN_MARKET_WINDOW_MS);
}

/** Recontagem de `totalMatches`/`scoredMatches` de uma rodada — hoje órfãs na UI. */
export async function refreshRoundMatchCounts(
  tx: Transaction,
  roundId: string,
): Promise<{ totalMatches: number; scoredMatches: number }> {
  const [counts] = await tx
    .select({
      totalMatches: sql<number>`count(*)::int`,
      scoredMatches: sql<number>`count(*) filter (where ${match.scrapedAt} is not null)::int`,
    })
    .from(match)
    .where(and(eq(match.roundId, roundId), isNull(match.dismissedAt)));

  const totalMatches = counts?.totalMatches ?? 0;
  const scoredMatches = counts?.scoredMatches ?? 0;
  await tx
    .update(round)
    .set({ totalMatches, scoredMatches })
    .where(eq(round.id, roundId));
  return { totalMatches, scoredMatches };
}
