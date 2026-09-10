import { inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { vlrEvent } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import { fetchHtml } from "@/lib/vlr/http/client";
import { logInfo, logWarn } from "@/lib/vlr/http/log";
import { upsertMatches } from "@/lib/vlr/persist/matches";
import { syncRoundsFromMatches } from "@/lib/vlr/persist/rounds";
import { lastListPage, parseMatchList } from "@/lib/vlr/scrapers/match-list";
import type { ScrapedMatchListItem } from "@/lib/vlr/schemas";

/**
 * Teto de segurança da varredura de `/matches`.
 *
 * A decisão do plano 13 é "varrer tudo", e `lastListPage` é quem diz onde
 * isso acaba — hoje 2 páginas. O teto não é uma política de produto, é o
 * fusível: se o vlr mudar a paginação (ou o seletor casar no lugar errado),
 * um número absurdo viraria centenas de requisições a 1,1s cada.
 * `/matches` lista só o que está por vir; passar disso é bug, não calendário.
 */
const MAX_SCHEDULE_PAGES = 12;

/**
 * O card da lista traz o **nome** do evento, nunca o id — só a página de
 * detalhe tem o `href` do evento. Casar por nome é, portanto, uma primeira
 * aproximação; `scrapeMatch` corrige o `eventId` com o id real quando a
 * partida for extraída.
 */
export async function resolveEventIdsByName(
  tx: Querier,
  names: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(names.map((name) => name.toLowerCase()))];
  if (unique.length === 0) return new Map();

  const rows = await tx
    .select({ id: vlrEvent.id, name: vlrEvent.name })
    .from(vlrEvent)
    .where(inArray(sql`lower(${vlrEvent.name})`, unique));

  return new Map(rows.map((row) => [row.name.toLowerCase(), row.id]));
}

/**
 * `/matches` → upsert do calendário → rodadas semanais.
 *
 * É o job que dá vida à regra inviolável nº 8: `syncRoundsFromMatches` coloca
 * em `round.marketClosesAt` o kickoff do primeiro jogo da semana, e daí
 * `isMarketOpen` — que já existia — passa a travar a escalação na hora certa,
 * sem nenhum código de UI novo.
 *
 * **Pagina até o fim.** A página 1 sozinha só cobre alguns dias em semana
 * cheia — um Champions daqui a um mês fica na página 2+, que antes nunca era
 * buscada. `lastListPage` lê quantas o próprio vlr anuncia; `options.pages`
 * sobrepõe isso (usado pelo script e pelos testes), sempre limitado por
 * `MAX_SCHEDULE_PAGES`. Toda a rede acontece **antes** da transação — segurar
 * uma transação aberta por várias rodadas de 1,1s de rate limit trocaria um
 * problema por outro.
 */
export async function syncSchedule(
  options: { pages?: number } = {},
): Promise<{ matches: number; rounds: number; pages: number }> {
  const first = await fetchHtml("/matches");
  const items = [...parseMatchList(first.html, "/matches")];

  const announced = options.pages ?? lastListPage(first.html);
  const last = Math.min(announced, MAX_SCHEDULE_PAGES);
  if (announced > last) {
    logWarn("vlr.schedule.pages_truncated", { announced, visited: last });
  }

  for (let page = 2; page <= last; page += 1) {
    const path = `/matches/?page=${page}`;
    const { html } = await fetchHtml(path);
    items.push(...parseMatchList(html, path));
  }

  return db.transaction(async (tx) => {
    const eventIds = await resolveEventIdsByName(
      tx,
      items.map((item) => item.event),
    );

    // Um card sem horário ("TBD") fica de fora: sem `scheduledAt` não há
    // semana ISO, e sem semana a partida cairia numa rodada inventada. Ela
    // volta na próxima execução, quando o vlr definir o horário.
    const scheduled = items.flatMap((item) =>
      item.scheduledAt ? [{ ...item, scheduledAt: item.scheduledAt }] : [],
    );
    const rows = scheduled.map((item) => toUpsertable(item, eventIds));
    await upsertMatches(tx, rows);

    // Sem `eventId` a partida nunca é enfileirada (`findMatchesToScrape` faz
    // INNER JOIN em `vlr_event`). O casamento é por **nome**, então um evento
    // que não veio na página `/events` some do pipeline em silêncio — este
    // aviso é o que torna isso visível.
    const withoutEvent = rows.filter((row) => row.eventId === null).length;
    if (withoutEvent > 0) {
      logWarn("vlr.schedule.without_event", {
        matches: withoutEvent,
        hint: "Rode `pnpm vlr:events` — o evento pode não estar em `vlr_event`.",
      });
    }
    const rounds = await syncRoundsFromMatches(tx);

    logInfo("vlr.schedule.synced", {
      matches: scheduled.length,
      skippedWithoutTime: items.length - scheduled.length,
      rounds: rounds.length,
      created: rounds.filter((row) => row.created).length,
      pages: last,
    });
    return { matches: scheduled.length, rounds: rounds.length, pages: last };
  });
}

/** Converte um card já filtrado (com horário) na linha de upsert de `match`. */
export function toUpsertable(
  item: ScrapedMatchListItem & { scheduledAt: Date },
  eventIds: Map<string, string>,
) {
  return {
    vlrId: item.vlrId,
    teamA: item.teamA,
    teamB: item.teamB,
    event: item.event,
    eventId: eventIds.get(item.event.toLowerCase()) ?? null,
    scheduledAt: item.scheduledAt,
    status: item.status,
    scoreA: item.scoreA,
    scoreB: item.scoreB,
  };
}
