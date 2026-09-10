import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { match, vlrEvent, vlrTeam } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import { logInfo } from "@/lib/vlr/http/log";
import { enqueue } from "@/lib/vlr/jobs/queue";
import { VLR_JOBS } from "@/lib/vlr/jobs/types";

/** Janela de relevância de um time — de longe o bastante para não perder quem só volta a jogar daqui a semanas. */
const ROSTER_LOOKBACK_DAYS = 45;
const ROSTER_LOOKAHEAD_DAYS = 30;

/**
 * As organizações que jogam (jogaram, vão jogar) num evento `tracked`, na
 * janela de relevância — a matéria-prima do elenco diário (Decisão 4, plano
 * 17). Cruza `match.teamA`/`teamB` (texto) com `vlr_team.name`, a mesma
 * igualdade de texto que sustenta o resto do pipeline.
 */
export async function findRosterTeams(
  tx: Querier,
  now: Date = new Date(),
): Promise<string[]> {
  const from = new Date(now.getTime() - ROSTER_LOOKBACK_DAYS * 86_400_000);
  const to = new Date(now.getTime() + ROSTER_LOOKAHEAD_DAYS * 86_400_000);

  const rows = await tx
    .select({ teamA: match.teamA, teamB: match.teamB })
    .from(match)
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId))
    .where(
      and(
        eq(vlrEvent.tracked, true),
        gte(match.scheduledAt, from),
        lte(match.scheduledAt, to),
        isNull(match.dismissedAt),
      ),
    );

  const names = new Set<string>();
  for (const row of rows) {
    names.add(row.teamA);
    names.add(row.teamB);
  }
  if (names.size === 0) return [];

  const teams = await tx
    .select({ vlrId: vlrTeam.vlrId })
    .from(vlrTeam)
    .where(inArray(vlrTeam.name, [...names]));

  return teams.map((row) => row.vlrId);
}

/**
 * `vlr:rosters` — diário, de manhã. Enfileira o elenco de todo time relevante
 * (~40 a 60 organizações, ~1 minuto de fila ao ritmo de 1,1s). Uma consulta
 * de banco por passada; quem vai à rede é `scrapeRoster`, via `vlr:work`.
 */
export async function syncRosters(
  now: Date = new Date(),
): Promise<{ enqueued: number }> {
  const enqueued = await db.transaction(async (tx) => {
    const teamVlrIds = await findRosterTeams(tx, now);
    return enqueue(tx, VLR_JOBS.scrapeRoster, teamVlrIds);
  });

  logInfo("vlr.rosters.enqueued", { enqueued });
  return { enqueued };
}
