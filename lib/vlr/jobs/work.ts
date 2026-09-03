import { db } from "@/db";
import { errorMessage, logError, logInfo } from "@/lib/vlr/http/log";
import { claim, complete, fail } from "@/lib/vlr/jobs/queue";
import { VLR_JOBS } from "@/lib/vlr/jobs/types";
import { scrapeMatch } from "@/lib/vlr/jobs/scrape-match";

/**
 * Consome a fila: uma partida por unidade de trabalho, **falha isolada não
 * derruba o lote**. Cada iteração é uma transação de reivindicação, uma
 * requisição e uma transação de escrita — nada que segure um lock enquanto a
 * rede responde.
 */
export async function workQueue(
  options: { limit?: number } = {},
): Promise<{ done: number; failed: number }> {
  const limit = options.limit ?? 10;
  let done = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = await db.transaction((tx) => claim(tx, VLR_JOBS.scrapeMatch));
    if (!job) break;

    const startedAt = Date.now();
    try {
      const result = await scrapeMatch(job.key);
      await db.transaction((tx) => complete(tx, job.id));
      done += 1;
      logInfo("vlr.job.done", {
        job: job.job,
        key: job.key,
        durationMs: Date.now() - startedAt,
        stats: result.statCount,
      });
    } catch (error) {
      failed += 1;
      const message = errorMessage(error);
      await db.transaction((tx) =>
        fail(tx, { id: job.id, attempts: job.attempts, error: message }),
      );
      logError("vlr.job.failed", {
        job: job.job,
        key: job.key,
        attempts: job.attempts,
        durationMs: Date.now() - startedAt,
        error: message,
      });
    }
  }

  logInfo("vlr.work.finished", { done, failed });
  return { done, failed };
}
