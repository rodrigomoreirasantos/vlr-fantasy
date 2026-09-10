import { and, eq, isNull, inArray } from "drizzle-orm";

import { db } from "@/db";
import { match, vlrEvent } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import { fetchHtml } from "@/lib/vlr/http/client";
import { fingerprint } from "@/lib/vlr/http/fingerprint";
import { logInfo } from "@/lib/vlr/http/log";
import { enqueue } from "@/lib/vlr/jobs/queue";
import { VLR_JOBS } from "@/lib/vlr/jobs/types";
import {
  resolveEventIdsByName,
  toUpsertable,
} from "@/lib/vlr/jobs/sync-schedule";
import { upsertMatches } from "@/lib/vlr/persist/matches";
import { pageChanged } from "@/lib/vlr/persist/page-state";
import { parseMatchList } from "@/lib/vlr/scrapers/match-list";

/**
 * As partidas encerradas de eventos `tracked` que ainda **não** foram
 * extraídas. A regra de cache permanente é literalmente esta cláusula
 * `WHERE`: com `scrapedAt IS NOT NULL`, a partida nunca é buscada de novo.
 */
export async function findMatchesToScrape(
  tx: Querier,
  vlrIds: readonly string[],
): Promise<string[]> {
  if (vlrIds.length === 0) return [];

  const rows = await tx
    .select({ vlrId: match.vlrId })
    .from(match)
    .innerJoin(vlrEvent, eq(match.eventId, vlrEvent.id))
    .where(
      and(
        inArray(match.vlrId, [...vlrIds]),
        eq(vlrEvent.tracked, true),
        eq(match.status, "finished"),
        isNull(match.scrapedAt),
      ),
    );

  return rows.flatMap((row) => (row.vlrId ? [row.vlrId] : []));
}

/**
 * `/matches/results` → marca as partidas como encerradas e enfileira a
 * extração das que faltam.
 *
 * `stopAfterKnown` interrompe a paginação depois de N páginas sem nenhuma
 * partida nova a extrair: numa execução de rotina isso acontece na primeira
 * página, e o job custa **uma** requisição.
 */
export async function syncResults(
  options: { pages?: number; stopAfterKnown?: number } = {},
): Promise<{ matches: number; enqueued: number; pages: number }> {
  const pages = options.pages ?? 1;
  const stopAfterKnown = options.stopAfterKnown ?? 1;

  let totalMatches = 0;
  let totalEnqueued = 0;
  let quietPages = 0;
  let visited = 0;

  for (let page = 1; page <= pages; page += 1) {
    const path =
      page === 1 ? "/matches/results" : `/matches/results/?page=${page}`;
    const { html } = await fetchHtml(path);
    const items = parseMatchList(html, path);
    visited += 1;

    // A digital desta página (Decisão 2, plano 17): idêntica à da última
    // leitura → nenhum resultado novo aqui, então nem upsert nem
    // enfileiramento têm o que fazer. A requisição já aconteceu; o que se
    // evita é o resto do trabalho desta página em diante.
    const hash = fingerprint(items);
    const changed = await db.transaction((tx) =>
      pageChanged(tx, { path, hash, at: new Date() }),
    );
    if (!changed) {
      logInfo("vlr.page.unchanged", { path });
      totalMatches += items.length;
      quietPages += 1;
      if (quietPages >= stopAfterKnown) break;
      continue;
    }

    const enqueued = await db.transaction(async (tx) => {
      const eventIds = await resolveEventIdsByName(
        tx,
        items.map((item) => item.event),
      );
      const scheduled = items.flatMap((item) =>
        item.scheduledAt ? [{ ...item, scheduledAt: item.scheduledAt }] : [],
      );
      await upsertMatches(
        tx,
        scheduled.map((item) => toUpsertable(item, eventIds)),
      );

      const pending = await findMatchesToScrape(
        tx,
        scheduled.map((item) => item.vlrId),
      );
      return enqueue(tx, VLR_JOBS.scrapeMatch, pending);
    });

    totalMatches += items.length;
    totalEnqueued += enqueued;

    quietPages = enqueued === 0 ? quietPages + 1 : 0;
    if (quietPages >= stopAfterKnown) break;
  }

  logInfo("vlr.results.synced", {
    matches: totalMatches,
    enqueued: totalEnqueued,
    pages: visited,
  });
  return { matches: totalMatches, enqueued: totalEnqueued, pages: visited };
}
