import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { fantasyIdentity } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";

/**
 * Marca o tour guiado como visto — concluído ou pulado, tanto faz, é o mesmo
 * fim de estado (`lib/tour/machine.ts`, transição `running → idle`).
 *
 * Sem transação de propósito: não mexe em saldo nem em qualquer outra tabela
 * (regra do CLAUDE.md sobre `db.transaction` é para dinheiro; isto é dado de
 * preferência do usuário). `isNull` no `where` é o que torna a escrita
 * idempotente — rever o tutorial pelo menu não reescreve a data da primeira
 * vez que o usuário fechou ou concluiu.
 */
export async function markTourCompleted(
  userId: string,
  q: Querier = db,
): Promise<void> {
  await q
    .update(fantasyIdentity)
    .set({ tourCompletedAt: new Date() })
    .where(
      and(
        eq(fantasyIdentity.userId, userId),
        isNull(fantasyIdentity.tourCompletedAt),
      ),
    );
}
