import { db } from "@/db";
import { fetchHtml } from "@/lib/vlr/http/client";
import { logInfo } from "@/lib/vlr/http/log";
import { applyRoster, type ApplyRosterResult } from "@/lib/vlr/persist/rosters";
import { parseTeamRoster } from "@/lib/vlr/scrapers/team-roster";

/** `/team/{vlrId}` — o vlr redireciona para o slug completo sozinho. */
export function teamRosterPath(vlrId: string): string {
  return `/team/${vlrId}`;
}

/**
 * O elenco atual de uma organização (Decisão 4, plano 17): 1 requisição, e a
 * escrita inteira numa única transação — o mesmo contrato de `scrapeMatch`.
 */
export async function scrapeRoster(vlrId: string): Promise<ApplyRosterResult> {
  const { html } = await fetchHtml(teamRosterPath(vlrId));
  const roster = parseTeamRoster(html, vlrId);

  const result = await db.transaction((tx) => applyRoster(tx, roster));

  logInfo("vlr.roster.applied", {
    teamVlrId: vlrId,
    team: roster.name,
    ...result,
  });
  return result;
}
