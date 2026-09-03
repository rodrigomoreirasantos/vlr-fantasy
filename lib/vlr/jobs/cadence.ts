import { and, eq, gte, lte, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { match, vlrEvent } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import { logInfo } from "@/lib/vlr/http/log";

/**
 * O ritmo da ingestão em dia de jogo.
 *
 * O cron é fixo; o que muda é o que cada execução faz. `/matches/results` é o
 * único job que vai à rede toda vez que roda — e, num dia sem partida, vai à
 * rede para reler exatamente a mesma página. Com este portão o cron pode
 * apertar (de 15 em 15 min para de 5 em 5) sem aumentar em nada o tráfego que
 * o vlr.gg recebe fora de dia de jogo: em janela de partida, custa uma
 * requisição por ciclo; fora dela, custa uma consulta ao banco.
 */

/** Quanto antes do kickoff a ingestão já entra em ritmo de dia de jogo. */
export const KICKOFF_LEAD_MS = 15 * 60_000;

/**
 * Quanto tempo depois do kickoff a partida ainda conta como em curso. Uma Bo5
 * longa cabe folgada aí dentro; o que passa disso não é jogo demorado, é
 * partida que o vlr nunca fechou (cancelada, W.O.) — e continuar batendo em
 * `/matches/results` por causa dela seria uma requisição por ciclo, para
 * sempre. Quem varre esses restos é a passada diária com `--force`.
 */
export const MATCH_TAIL_MS = 12 * 60 * 60_000;

/** A janela de kickoff que conta como "tem jogo agora". */
export function matchWindow(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - MATCH_TAIL_MS),
    to: new Date(now.getTime() + KICKOFF_LEAD_MS),
  };
}

/**
 * Quantas partidas de campeonato seguido já começaram (ou estão prestes a) e
 * ainda não foram fechadas pelo vlr.
 *
 * É exatamente o conjunto que uma passada em `/matches/results` resolveria:
 * zero aqui significa que a página não teria nada de novo a dizer.
 */
export async function countMatchesInPlay(
  now: Date = new Date(),
  q: Querier = db,
): Promise<number> {
  const { from, to } = matchWindow(now);

  const [row] = await q
    .select({ count: sql<number>`count(*)::int` })
    .from(match)
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId))
    .where(
      and(
        eq(vlrEvent.tracked, true),
        ne(match.status, "finished"),
        gte(match.scheduledAt, from),
        lte(match.scheduledAt, to),
      ),
    );

  return row?.count ?? 0;
}

/**
 * Vale ir à rede agora? Registra a decisão nos dois casos — um job que não faz
 * nada precisa dizer por quê, senão vira silêncio indistinguível de falha.
 */
export async function isMatchWindow(
  now: Date = new Date(),
  q: Querier = db,
): Promise<boolean> {
  const inPlay = await countMatchesInPlay(now, q);
  logInfo("vlr.cadence.window", { inPlay, active: inPlay > 0 });
  return inPlay > 0;
}
