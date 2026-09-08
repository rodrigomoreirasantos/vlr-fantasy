import { sql } from "drizzle-orm";

import { vlrEvent } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import type { ScrapedEvent } from "@/lib/vlr/schemas";

/**
 * Upsert de eventos por `vlrId`. **Nunca escreve `tracked`**: a allowlist é
 * uma decisão do operador, e um scraper que a sobrescrevesse tiraria do ar,
 * sozinho, o campeonato inteiro do jogo.
 *
 * **E nunca apaga o que já sabe.** `scrapeMatch` chama este mesmo upsert com
 * o evento que veio na página da partida — que traz só `vlrId` e `name`, e
 * portanto `region: null`, `status: "unknown"` e datas vazias. Sem os
 * `coalesce` abaixo, cada partida extraída zerava a região que `vlr:events`
 * tinha preenchido, e era exatamente por isso que os eventos seguidos ficavam
 * sem região enquanto os não seguidos a mantinham. Mesmo padrão de
 * `upsertTeams`.
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
        region: sql`coalesce(excluded.region, ${vlrEvent.region})`,
        startsAt: sql`coalesce(excluded.starts_at, ${vlrEvent.startsAt})`,
        endsAt: sql`coalesce(excluded.ends_at, ${vlrEvent.endsAt})`,
        // `unknown` é o que a página da partida sabe dizer sobre o evento:
        // ausência de informação, não um status novo.
        status: sql`case when excluded.status = 'unknown'
          then ${vlrEvent.status} else excluded.status end`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: vlrEvent.id, vlrId: vlrEvent.vlrId });

  return new Map(rows.map((row) => [row.vlrId, row.id]));
}
