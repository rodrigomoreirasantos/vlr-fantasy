import { db } from "@/db";
import { fetchHtml } from "@/lib/vlr/http/client";
import { logInfo } from "@/lib/vlr/http/log";
import { upsertEvents } from "@/lib/vlr/persist/events";
import { parseEventList } from "@/lib/vlr/scrapers/event-list";

/**
 * `/events` → `vlr_event`. **A flag `tracked` é sua, não do scraper**: rode
 * isto, abra o `pnpm db:studio` e marque os campeonatos que o fantasy segue.
 */
export async function syncEvents(): Promise<{ count: number }> {
  const { html } = await fetchHtml("/events");
  const events = parseEventList(html, "/events");

  await db.transaction((tx) => upsertEvents(tx, events));

  logInfo("vlr.events.synced", { count: events.length });
  return { count: events.length };
}
