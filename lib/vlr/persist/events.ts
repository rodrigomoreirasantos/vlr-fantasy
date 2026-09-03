import { sql } from "drizzle-orm";

import { vlrEvent } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import type { ScrapedEvent } from "@/lib/vlr/schemas";

/**
 * Upsert de eventos por `vlrId`. **Nunca escreve `tracked`**: a allowlist é
 * uma decisão do operador, e um scraper que a sobrescrevesse tiraria do ar,
 * sozinho, o campeonato inteiro do jogo.
 *
 * Devolve `vlrId → id` para quem precisa ligar partidas ao evento.
 */
export async function upsertEvents(
  tx: Querier,
  events: readonly ScrapedEvent[],
): Promise<Map<string, string>> {
  if (events.length === 0) return new Map();

  const rows = await tx
    .insert(vlrEvent)
    .values(
      events.map((event) => ({
        vlrId: event.vlrId,
        name: event.name,
        region: event.region,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        status: event.status,
      })),
    )
    .onConflictDoUpdate({
      target: vlrEvent.vlrId,
      set: {
        name: sql`excluded.name`,
        region: sql`excluded.region`,
        startsAt: sql`excluded.starts_at`,
        endsAt: sql`excluded.ends_at`,
        status: sql`excluded.status`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: vlrEvent.id, vlrId: vlrEvent.vlrId });

  return new Map(rows.map((row) => [row.vlrId, row.id]));
}
