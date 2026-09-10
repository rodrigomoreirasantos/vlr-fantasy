import { eq, sql } from "drizzle-orm";

import { vlrEvent } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import { isCircuitEvent } from "@/lib/vlr/normalize/tracking";
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

/**
 * Liga `tracked` sozinho para todo evento do circuito (`isCircuitEvent`,
 * lib/vlr/normalize/tracking.ts) cujo veto humano (`trackedOverride`) ainda
 * é `null` — Decisão 3 do plano 17. **Nunca desliga**: só considera quem
 * ainda não está seguido, e quem tem `trackedOverride = false` nunca entra
 * aqui, mesmo casando com a regra. A pessoa continua podendo ligar/desligar
 * pelo `pnpm db:studio`; este automático nunca escreve por cima dela.
 */
export async function applyAutoTracking(
  tx: Querier,
): Promise<{ tracked: string[] }> {
  // A consulta traz todo evento ainda não seguido — o veto humano é
  // conferido em memória (`trackedOverride === null`) para o caminho ficar
  // testável sem precisar reproduzir a árvore SQL de `and`/`isNull` no teste.
  const candidates = await tx.query.vlrEvent.findMany({
    where: eq(vlrEvent.tracked, false),
  });

  const toTrack = candidates.filter(
    (row) =>
      row.trackedOverride === null &&
      isCircuitEvent({ name: row.name, status: row.status }),
  );
  if (toTrack.length === 0) return { tracked: [] };

  for (const row of toTrack) {
    await tx
      .update(vlrEvent)
      .set({ tracked: true })
      .where(eq(vlrEvent.id, row.id));
  }

  return { tracked: toTrack.map((row) => row.vlrId) };
}
