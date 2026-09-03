import { load } from "cheerio";

import { parseVlrDayTime } from "@/lib/vlr/normalize/kickoff";
import {
  parseScraped,
  scrapedEventSchema,
  type ScrapedEvent,
} from "@/lib/vlr/schemas";
import { EVENT_LIST } from "@/lib/vlr/scrapers/selectors";
import {
  SelectorMissError,
  regionFromFlagClass,
  requireAll,
  text,
  vlrIdFromHref,
} from "@/lib/vlr/scrapers/parse";

/**
 * `/events` — o catálogo de campeonatos. A flag `tracked` de `vlr_event` é
 * **nossa**, não do scraper: este parser só descreve o que existe, e é o
 * operador quem decide qual evento vira rodada e catálogo.
 */
export function parseEventList(
  html: string,
  context: string,
  now: Date = new Date(),
): ScrapedEvent[] {
  const $ = load(html);
  const cards = requireAll($, EVENT_LIST.card, context);
  const events: ScrapedEvent[] = [];

  cards.each((_, node) => {
    const card = $(node);
    const vlrId = vlrIdFromHref(card.attr("href"), "event");
    if (!vlrId) return;

    const status = text(card.find(EVENT_LIST.status).first());
    // O bloco de datas carrega o rótulo "Dates" como filho: sem removê-lo,
    // o texto vira "Sep 6 Dates" e a data final se perde em silêncio.
    const datesClone = card.find(EVENT_LIST.dates).first().clone();
    datesClone.find(EVENT_LIST.descLabel).remove();
    const range = parseDateRange(text(datesClone), now);

    events.push(
      parseScraped(
        scrapedEventSchema,
        {
          vlrId,
          name: text(card.find(EVENT_LIST.title).first()),
          status: status.length > 0 ? status : "unknown",
          // A região vem na **classe** da bandeira (`mod-kr`), nunca em texto.
          region: regionFromFlagClass(
            card.find(EVENT_LIST.regionFlag).first().attr("class"),
          ),
          startsAt: range.startsAt,
          endsAt: range.endsAt,
        },
        `${context} event ${vlrId}`,
      ),
    );
  });

  if (events.length === 0)
    throw new SelectorMissError(EVENT_LIST.card, context);
  return events;
}

/**
 * `"Jul 15—Sep 6"` → as duas datas. ⚠️ **O vlr não escreve o ano.** Assumimos
 * o ano corrente e corrigimos a virada: um intervalo que "termina antes de
 * começar" (dez → jan) empurra o fim para o ano seguinte.
 */
function parseDateRange(
  raw: string,
  now: Date,
): { startsAt: Date | null; endsAt: Date | null } {
  const parts = raw.split(/[—–-]/).map((part) => part.trim());
  if (parts.length < 2) return { startsAt: null, endsAt: null };

  const year = now.getUTCFullYear();
  const startsAt = parseVlrDayTime(
    `${expandMonth(parts[0])}, ${year}`,
    "12:00 PM",
  );
  let endsAt = parseVlrDayTime(`${expandMonth(parts[1])}, ${year}`, "12:00 PM");

  if (startsAt && endsAt && endsAt < startsAt) {
    endsAt = parseVlrDayTime(
      `${expandMonth(parts[1])}, ${year + 1}`,
      "12:00 PM",
    );
  }
  return { startsAt, endsAt };
}

/** `"Jul 15"` → `"July 15"` — `parseVlrDayTime` conhece o mês por extenso. */
const MONTH_ABBREVIATIONS: Readonly<Record<string, string>> = {
  jan: "January",
  feb: "February",
  mar: "March",
  apr: "April",
  may: "May",
  jun: "June",
  jul: "July",
  aug: "August",
  sep: "September",
  oct: "October",
  nov: "November",
  dec: "December",
};

function expandMonth(raw: string): string {
  return raw.replace(/^([A-Za-z]{3})[a-z]*/, (match, abbr: string) => {
    return MONTH_ABBREVIATIONS[abbr.toLowerCase()] ?? match;
  });
}
