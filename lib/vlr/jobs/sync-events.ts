import { db } from "@/db";
import { fetchHtml } from "@/lib/vlr/http/client";
import { logInfo } from "@/lib/vlr/http/log";
import { applyAutoTracking, upsertEvents } from "@/lib/vlr/persist/events";
import { parseEventList } from "@/lib/vlr/scrapers/event-list";

/**
 * `/events` → `vlr_event`, e em seguida liga `tracked` sozinho para quem é
 * do circuito (`applyAutoTracking`, Decisão 3 do plano 17) — na mesma
 * transação, para nunca existir um instante em que os eventos estão
 * atualizados mas o auto-tracking ainda não rodou. O veto humano
 * (`tracked_override`) continua podendo forçar seguir/não seguir, e
 * `db:studio` continua sendo o jeito de ajustar quem esse automático não
 * pegou (evento fora do padrão de nome, torneio novo que a regra não prevê).
 */
export async function syncEvents(): Promise<{
  count: number;
  autoTracked: string[];
}> {
  const { html } = await fetchHtml("/events");
  const events = parseEventList(html, "/events");

  const { tracked: autoTracked } = await db.transaction(async (tx) => {
    await upsertEvents(tx, events);
    return applyAutoTracking(tx);
  });

  logInfo("vlr.events.synced", { count: events.length, autoTracked });
  return { count: events.length, autoTracked };
}
