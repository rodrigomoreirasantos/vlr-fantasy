import { and, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { match, vlrEvent } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import { logInfo } from "@/lib/vlr/http/log";
import { enqueue } from "@/lib/vlr/jobs/queue";
import { VLR_JOBS } from "@/lib/vlr/jobs/types";

/**
 * A janela da releitura tardia (Decisão 5, plano 17): cedo o bastante para
 * pegar a correção típica do vlr, tarde o bastante para não brigar com a
 * extração inicial que acabou de acontecer.
 */
export const REVALIDATE_MIN_AGE_MS = 6 * 60 * 60_000;
export const REVALIDATE_MAX_AGE_MS = 48 * 60 * 60_000;

/**
 * As partidas candidatas à releitura tardia agora: de evento `tracked`,
 * extraídas entre 6h e 48h atrás, ainda não revalidadas e não descartadas
 * (Decisão 6). Fora dessa janela ninguém é candidato — nem quem acabou de ser
 * extraído, nem quem já passou do prazo.
 */
export async function findMatchesToRevalidate(
  tx: Querier,
  now: Date = new Date(),
): Promise<string[]> {
  const from = new Date(now.getTime() - REVALIDATE_MAX_AGE_MS);
  const to = new Date(now.getTime() - REVALIDATE_MIN_AGE_MS);

  const rows = await tx
    .select({ vlrId: match.vlrId })
    .from(match)
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId))
    .where(
      and(
        eq(vlrEvent.tracked, true),
        isNotNull(match.scrapedAt),
        gte(match.scrapedAt, from),
        lte(match.scrapedAt, to),
        isNull(match.revalidatedAt),
        isNull(match.dismissedAt),
      ),
    );

  return rows.flatMap((row) => (row.vlrId ? [row.vlrId] : []));
}

/**
 * `vlr:revalidate` — de hora em hora, enfileira a releitura tardia de quem
 * entrou na janela. **Uma consulta ao banco, nenhuma requisição ao vlr**:
 * quem vai à rede é `revalidateMatch`, consumido depois por `vlr:work`
 * (Fase 5, plano 17).
 */
export async function syncRevalidations(
  now: Date = new Date(),
): Promise<{ enqueued: number }> {
  const enqueued = await db.transaction(async (tx) => {
    const vlrIds = await findMatchesToRevalidate(tx, now);
    return enqueue(tx, VLR_JOBS.revalidateMatch, vlrIds);
  });

  logInfo("vlr.revalidate.enqueued", { enqueued });
  return { enqueued };
}
