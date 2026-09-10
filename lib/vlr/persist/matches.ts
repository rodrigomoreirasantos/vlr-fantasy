import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { match, vlrEvent } from "@/db/schema";
import type { MatchStatus } from "@/lib/round/types";
import type { Querier } from "@/lib/team/queries";
import { logWarn } from "@/lib/vlr/http/log";

export type UpsertableMatch = {
  vlrId: string;
  teamA: string;
  teamB: string;
  event: string;
  eventId: string | null;
  scheduledAt: Date;
  status: MatchStatus;
  scoreA: number | null;
  scoreB: number | null;
  bestOf?: number | null;
};

/**
 * Upsert do calendário por `vlrId` — a chave natural que `match` nunca teve
 * (o seed contornava com uma checagem manual).
 *
 * **Nunca sobrescreve `scrapedAt`, `rawHtmlPath` nem `roundId`.** Os dois
 * primeiros são propriedade de `saveMatchStats`; o terceiro, de
 * `syncRoundsFromMatches`. Um `syncSchedule` rodando de novo não pode
 * desfazer o trabalho de nenhum dos dois — é o que sustenta a regra de cache
 * permanente.
 */
export async function upsertMatches(
  tx: Querier,
  matches: readonly UpsertableMatch[],
): Promise<Map<string, string>> {
  const unique = new Map<string, UpsertableMatch>();
  for (const row of matches) {
    // O CHECK `match_distinct_orgs` recusa os dois lados iguais — acontece com
    // um card de TBD vs TBD. Descartar um card é melhor que derrubar o lote.
    if (row.teamA === row.teamB) {
      logWarn("vlr.match.skipped_same_teams", {
        vlrId: row.vlrId,
        team: row.teamA,
      });
      continue;
    }
    unique.set(row.vlrId, row);
  }
  if (unique.size === 0) return new Map();

  const rows = await tx
    .insert(match)
    .values(
      [...unique.values()].map((row) => ({
        vlrId: row.vlrId,
        teamA: row.teamA,
        teamB: row.teamB,
        event: row.event,
        eventId: row.eventId,
        scheduledAt: row.scheduledAt,
        status: row.status,
        scoreA: row.scoreA,
        scoreB: row.scoreB,
        bestOf: row.bestOf ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: match.vlrId,
      set: {
        teamA: sql`excluded.team_a`,
        teamB: sql`excluded.team_b`,
        event: sql`excluded.event`,
        eventId: sql`coalesce(excluded.event_id, ${match.eventId})`,
        // A lista dá um horário aproximado (cabeçalho do dia + hora do card);
        // o detalhe dá o `data-utc-ts` exato. Uma partida já extraída não tem
        // seu horário rebaixado — `marketClosesAt` deriva dele.
        scheduledAt: sql`case when ${match.scrapedAt} is null
          then excluded.scheduled_at else ${match.scheduledAt} end`,
        status: sql`excluded.status`,
        scoreA: sql`coalesce(excluded.score_a, ${match.scoreA})`,
        scoreB: sql`coalesce(excluded.score_b, ${match.scoreB})`,
        bestOf: sql`coalesce(excluded.best_of, ${match.bestOf})`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: match.id, vlrId: match.vlrId });

  return new Map(rows.map((row) => [row.vlrId ?? "", row.id]));
}

/**
 * Marca partida cancelada como sumida (Decisão 6, plano 17) — nunca apaga.
 * Chamada no fim de toda varredura de `/matches` com o conjunto de `vlrId`
 * que a varredura de fato viu:
 *
 * 1. **Vista de novo** → `missingSince`/`dismissedAt` voltam a `null` — o
 *    card foi remarcado e ressuscita sozinho, mesmo já `dismissedAt`.
 * 2. **Ausente, 1ª vez** (`missingSince` era `null`) → grava `missingSince`.
 * 3. **Ausente, 2ª vez seguida** (`missingSince` já existia e é anterior a
 *    `sweptAt`) → grava `dismissedAt`. Uma vez descartada, não conta mais
 *    até ser vista de novo.
 *
 * **A trava de segurança:** só entram na conta partidas de evento `tracked`,
 * `status = 'upcoming'`, `scrapedAt IS NULL` e `scheduledAt` entre `sweptAt`
 * e `horizonAt` — o maior `scheduledAt` que a varredura **de fato** viu. Sem
 * isso, a primeira partida além do teto de paginação seria marcada sumida por
 * nunca aparecer. Quem decide se vale chamar esta função (varredura truncada
 * pula a chamada inteira) é o chamador (`syncSchedule`), não esta função.
 */
export async function markMissingMatches(
  tx: Querier,
  args: {
    seenVlrIds: readonly string[];
    horizonAt: Date;
    sweptAt: Date;
  },
): Promise<{ flagged: number; dismissed: number; restored: number }> {
  const { seenVlrIds, horizonAt, sweptAt } = args;
  const seen = new Set(seenVlrIds);

  const candidates = await tx
    .select({
      id: match.id,
      vlrId: match.vlrId,
      missingSince: match.missingSince,
      dismissedAt: match.dismissedAt,
    })
    .from(match)
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId))
    .where(
      and(
        eq(vlrEvent.tracked, true),
        eq(match.status, "upcoming"),
        isNull(match.scrapedAt),
        gte(match.scheduledAt, sweptAt),
        lte(match.scheduledAt, horizonAt),
      ),
    );

  let flagged = 0;
  let dismissed = 0;
  let restored = 0;

  for (const row of candidates) {
    const isSeen = row.vlrId !== null && seen.has(row.vlrId);

    if (isSeen) {
      if (row.missingSince !== null || row.dismissedAt !== null) {
        await tx
          .update(match)
          .set({ missingSince: null, dismissedAt: null })
          .where(eq(match.id, row.id));
        restored += 1;
      }
      continue;
    }

    // Ausente. Já descartada: nada a fazer até ela voltar a aparecer.
    if (row.dismissedAt !== null) continue;

    if (row.missingSince === null) {
      await tx
        .update(match)
        .set({ missingSince: sweptAt })
        .where(eq(match.id, row.id));
      flagged += 1;
    } else if (row.missingSince.getTime() < sweptAt.getTime()) {
      await tx
        .update(match)
        .set({ dismissedAt: sweptAt })
        .where(eq(match.id, row.id));
      dismissed += 1;
    }
  }

  return { flagged, dismissed, restored };
}

/** Partidas marcadas como sumidas (Decisão 6, plano 17) — o número que o `doctor` denuncia. */
export async function countDismissedMatches(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(match)
    .where(isNotNull(match.dismissedAt));
  return row?.count ?? 0;
}
