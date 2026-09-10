import { sql } from "drizzle-orm";

import { vlrJobHealth } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import type { VlrJobHealthStatus } from "@/lib/vlr/jobs/types";

export type RecordJobRunArgs = {
  job: string;
  status: VlrJobHealthStatus;
  startedAt: Date;
  finishedAt: Date;
  /** O resumo que hoje só existia no log JSON do console. */
  summary?: string | null;
  /** Só relevante quando `status === "failed"`. */
  error?: string | null;
};

/**
 * Grava o batimento de uma execução completa de um script `vlr:*` — uma
 * linha por job, sempre a última (Decisão 7, plano 17). Chamada por
 * `runScript` (`scripts/vlr/run.ts`), no `finally` de todo entrypoint, para
 * nenhum script individual precisar saber que isto existe.
 *
 * `consecutiveFailures` zera a cada sucesso e incrementa a cada falha — a
 * base de "falhou 3x seguidas" do `pnpm vlr:health`.
 */
export async function recordJobRun(
  tx: Querier,
  args: RecordJobRunArgs,
): Promise<void> {
  const failed = args.status === "failed";

  await tx
    .insert(vlrJobHealth)
    .values({
      job: args.job,
      lastStatus: args.status,
      lastStartedAt: args.startedAt,
      lastFinishedAt: args.finishedAt,
      lastDurationMs: args.finishedAt.getTime() - args.startedAt.getTime(),
      lastSummary: args.summary ?? null,
      lastError: failed ? (args.error ?? null) : null,
      consecutiveFailures: failed ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: vlrJobHealth.job,
      set: {
        lastStatus: sql`excluded.last_status`,
        lastStartedAt: sql`excluded.last_started_at`,
        lastFinishedAt: sql`excluded.last_finished_at`,
        lastDurationMs: sql`excluded.last_duration_ms`,
        lastSummary: sql`excluded.last_summary`,
        lastError: sql`excluded.last_error`,
        consecutiveFailures: failed
          ? sql`${vlrJobHealth.consecutiveFailures} + 1`
          : sql`0`,
        updatedAt: new Date(),
      },
    });
}
