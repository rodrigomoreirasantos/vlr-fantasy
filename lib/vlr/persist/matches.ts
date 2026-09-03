import { sql } from "drizzle-orm";

import { match } from "@/db/schema";
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
