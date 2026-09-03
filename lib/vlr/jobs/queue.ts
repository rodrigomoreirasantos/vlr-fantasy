import { and, asc, eq, lt, lte, or, sql } from "drizzle-orm";

import { vlrJobRun } from "@/db/schema";
import type { Querier, Transaction } from "@/lib/team/queries";
import type { VlrJob } from "@/lib/vlr/jobs/types";

/** Três tentativas antes da dead letter queue. */
export const MAX_ATTEMPTS = 3;

/** Backoff exponencial em minutos: 2, 4, 8… */
const BACKOFF_BASE_MINUTES = 2;

/**
 * Depois disto, uma unidade `running` é considerada abandonada. `claim`
 * commita a transição para `running` e solta o lock; se o processo morrer
 * antes do `complete`/`fail` (deploy, OOM, timeout do cron), a linha ficaria
 * `running` para sempre — e `enqueue` a ignora de propósito, então a partida
 * sumiria da fila em silêncio.
 */
export const LEASE_MS = 15 * 60_000;

export type ClaimedJob = {
  id: string;
  job: string;
  key: string;
  attempts: number;
};

/**
 * Enfileira uma unidade de trabalho. Idempotente pelo par `(job, key)`:
 * enfileirar a mesma partida duas vezes é um upsert, não uma linha nova.
 *
 * Uma linha `done` volta a `pending` — é assim que um reprocessamento
 * deliberado é pedido. Uma linha `running` é deixada em paz: já tem dono.
 */
export async function enqueue(
  tx: Querier,
  job: VlrJob,
  keys: readonly string[],
): Promise<number> {
  if (keys.length === 0) return 0;

  const unique = [...new Set(keys)];
  const rows = await tx
    .insert(vlrJobRun)
    .values(unique.map((key) => ({ job, key })))
    .onConflictDoUpdate({
      target: [vlrJobRun.job, vlrJobRun.key],
      set: {
        status: "pending",
        attempts: 0,
        lastError: null,
        runAfter: new Date(),
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      },
      where: sql`${vlrJobRun.status} <> 'running'`,
    })
    .returning({ id: vlrJobRun.id });

  return rows.length;
}

/**
 * Reivindica a próxima unidade elegível. `FOR UPDATE SKIP LOCKED` é o que
 * permite rodar dois workers ao mesmo tempo sem que os dois peguem a mesma
 * partida — e sem um deles ficar esperando o lock do outro.
 *
 * Exige `Transaction`: o lock da linha só vale enquanto a transação estiver
 * aberta, e é dentro dela que o `UPDATE` para `running` acontece.
 */
export async function claim(
  tx: Transaction,
  job: VlrJob,
  now: Date = new Date(),
): Promise<ClaimedJob | null> {
  const staleBefore = new Date(now.getTime() - LEASE_MS);

  const [candidate] = await tx
    .select({ id: vlrJobRun.id })
    .from(vlrJobRun)
    .where(
      and(
        eq(vlrJobRun.job, job),
        or(
          and(eq(vlrJobRun.status, "pending"), lte(vlrJobRun.runAfter, now)),
          // A retomada do lease expirado: um worker que morreu no meio não
          // leva a partida junto.
          and(
            eq(vlrJobRun.status, "running"),
            lt(vlrJobRun.startedAt, staleBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(vlrJobRun.runAfter))
    .limit(1)
    .for("update", { skipLocked: true });

  if (!candidate) return null;

  const [claimed] = await tx
    .update(vlrJobRun)
    .set({
      status: "running",
      startedAt: now,
      attempts: sql`${vlrJobRun.attempts} + 1`,
      updatedAt: now,
    })
    .where(eq(vlrJobRun.id, candidate.id))
    .returning({
      id: vlrJobRun.id,
      job: vlrJobRun.job,
      key: vlrJobRun.key,
      attempts: vlrJobRun.attempts,
    });

  return claimed ?? null;
}

export async function complete(
  tx: Querier,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  await tx
    .update(vlrJobRun)
    .set({ status: "done", finishedAt: now, lastError: null, updatedAt: now })
    .where(eq(vlrJobRun.id, id));
}

/**
 * Marca a falha e reagenda com backoff. Na `MAX_ATTEMPTS`-ésima tentativa a
 * linha vira `dead`: fica no banco, visível e contável por SQL, mas ninguém
 * mais a tenta sozinho.
 */
export async function fail(
  tx: Querier,
  args: { id: string; attempts: number; error: string },
  now: Date = new Date(),
): Promise<void> {
  const exhausted = args.attempts >= MAX_ATTEMPTS;
  const runAfter = new Date(
    now.getTime() +
      BACKOFF_BASE_MINUTES * 2 ** Math.max(0, args.attempts - 1) * 60_000,
  );

  await tx
    .update(vlrJobRun)
    .set({
      status: exhausted ? "dead" : "pending",
      lastError: args.error.slice(0, 2_000),
      runAfter,
      finishedAt: exhausted ? now : null,
      updatedAt: now,
    })
    .where(eq(vlrJobRun.id, args.id));
}
