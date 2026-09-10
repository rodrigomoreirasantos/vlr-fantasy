import { load } from "cheerio";

import type { MatchStatus } from "@/lib/round/types";
import { parseVlrDayTime } from "@/lib/vlr/normalize/kickoff";
import {
  parseScraped,
  scrapedMatchListItemSchema,
  type ScrapedMatchListItem,
} from "@/lib/vlr/schemas";
import { MATCH_LIST } from "@/lib/vlr/scrapers/selectors";
import {
  SelectorMissError,
  int,
  requireAll,
  text,
  vlrIdFromHref,
} from "@/lib/vlr/scrapers/parse";

/**
 * `/matches` e `/matches/results` — o mesmo card nas duas páginas, por isso
 * um parser só.
 *
 * ⚠️ **A data não está no card.** Ela vive no cabeçalho de dia
 * (`.wf-label.mod-large`), que é irmão do `.wf-card` que agrupa os cards do
 * dia. O parser varre o documento **em ordem**, carregando o último cabeçalho
 * visto — é a única forma de saber a que dia cada card pertence.
 */
export function parseMatchList(
  html: string,
  context: string,
): ScrapedMatchListItem[] {
  const $ = load(html);

  // Seletor composto: o css-select devolve em ordem de documento, que é
  // exatamente o que a varredura precisa.
  const nodes = requireAll(
    $,
    `${MATCH_LIST.dayLabel}, ${MATCH_LIST.card}`,
    context,
  );

  const items: ScrapedMatchListItem[] = [];
  let currentDay = "";
  let sawCard = false;

  nodes.each((_, node) => {
    const el = $(node);

    if (el.is(MATCH_LIST.card)) {
      sawCard = true;
      const item = parseCard($, el, currentDay, context);
      if (item) items.push(item);
      return;
    }

    // Cabeçalho de dia. O selo "Today"/"Tomorrow" é um filho — some no clone.
    const clone = el.clone();
    clone.find(".wf-tag").remove();
    currentDay = text(clone);
  });

  if (!sawCard) throw new SelectorMissError(MATCH_LIST.card, context);
  return items;
}

/**
 * A última página da lista, lida da própria paginação do rodapé.
 *
 * **Não** usa `requireAll`: uma lista de página única não tem paginação
 * nenhuma, e isso é um estado legítimo — devolve `1`. Diferente de um card
 * ausente, que é seletor quebrado e deve falhar alto.
 */
export function lastListPage(html: string): number {
  const $ = load(html);
  const numbers = $(`${MATCH_LIST.pages} ${MATCH_LIST.pageItem}`)
    .map((_, node) => int(text($(node))))
    .get()
    .flatMap((value) => (value === null ? [] : [value]));

  return numbers.length > 0 ? Math.max(...numbers, 1) : 1;
}

type CardElement = ReturnType<ReturnType<typeof load>>;

function parseCard(
  $: ReturnType<typeof load>,
  card: CardElement,
  day: string,
  context: string,
): ScrapedMatchListItem | null {
  const vlrId = vlrIdFromHref(card.attr("href"));
  if (!vlrId) return null;

  const names = card.find(MATCH_LIST.teamName);
  if (names.length < 2)
    throw new SelectorMissError(MATCH_LIST.teamName, context);

  // O placar de uma partida por vir mostra "–" e ganha `.mod-upcoming`.
  // **Não** use `.mod-dash`: em `/matches/results` ela marca a máscara de
  // spoiler e convive com um placar real.
  const upcoming = card.find(MATCH_LIST.scoreUpcoming).length > 0;
  const scores = card.find(MATCH_LIST.teamScore);

  const eventClone = card.find(MATCH_LIST.event).first().clone();
  const series = text(card.find(MATCH_LIST.eventSeries).first());
  eventClone.find(MATCH_LIST.eventSeries).remove();

  const item = {
    vlrId,
    teamA: text(names.eq(0)),
    teamB: text(names.eq(1)),
    scoreA: upcoming ? null : int(text(scores.eq(0))),
    scoreB: upcoming ? null : int(text(scores.eq(1))),
    scheduledAt: parseVlrDayTime(day, text(card.find(MATCH_LIST.time).first())),
    status: statusOf(text(card.find(MATCH_LIST.status).first()), upcoming),
    event: text(eventClone),
    eventSeries: series.length > 0 ? series : null,
  };
  return parseScraped(
    scrapedMatchListItemSchema,
    item,
    `${context} match ${vlrId}`,
  );
}

/** "Completed" / "LIVE" / "Upcoming" / "TBD" → o enum `match_status` do banco. */
function statusOf(label: string, upcoming: boolean): MatchStatus {
  const lowered = label.toLowerCase();
  if (lowered.includes("live")) return "live";
  if (lowered.includes("completed")) return "finished";
  return upcoming ? "upcoming" : "finished";
}
