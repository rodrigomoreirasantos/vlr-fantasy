import { eq } from "drizzle-orm";

import { vlrPageState } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";

/**
 * A digital de uma página de **lista** (`/matches`, `/matches/results`) —
 * distinta de `match.contentHash`, que é por partida (Fase 4, plano 17).
 *
 * Devolve `true` na primeira vez que o caminho é visto, ou quando a digital
 * mudou desde a última leitura — é quando o chamador deve seguir o fluxo
 * normal (upsert, enfileiramento, paginação seguinte). Devolve `false` quando
 * o payload interpretado é **idêntico** ao da última leitura: a requisição já
 * aconteceu (o `no-store` sem `ETag` do vlr não deixa escapar dela), mas
 * processar de novo o mesmo conteúdo não muda nada.
 */
export async function pageChanged(
  tx: Querier,
  args: { path: string; hash: string; at: Date },
): Promise<boolean> {
  const existing = await tx.query.vlrPageState.findFirst({
    where: eq(vlrPageState.path, args.path),
  });

  if (!existing) {
    await tx.insert(vlrPageState).values({
      path: args.path,
      contentHash: args.hash,
      fetchedAt: args.at,
      changedAt: args.at,
      unchangedRuns: 0,
    });
    return true;
  }

  if (existing.contentHash === args.hash) {
    await tx
      .update(vlrPageState)
      .set({
        fetchedAt: args.at,
        unchangedRuns: existing.unchangedRuns + 1,
      })
      .where(eq(vlrPageState.id, existing.id));
    return false;
  }

  await tx
    .update(vlrPageState)
    .set({
      contentHash: args.hash,
      fetchedAt: args.at,
      changedAt: args.at,
      unchangedRuns: 0,
    })
    .where(eq(vlrPageState.id, existing.id));
  return true;
}
