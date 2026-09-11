import { db } from "@/db";
import { refreshPlayerForm } from "@/lib/vlr/jobs/calculate-round";
import { errorMessage, logError, logInfo } from "@/lib/vlr/http/log";
import { claim, complete, fail } from "@/lib/vlr/jobs/queue";
import { revalidateMatch, scrapeMatch } from "@/lib/vlr/jobs/scrape-match";
import { scrapeRoster } from "@/lib/vlr/jobs/scrape-roster";
import { VLR_JOBS, type VlrJob } from "@/lib/vlr/jobs/types";

/**
 * Um handler por tipo de trabalho — a fila deixou de ser de um job só
 * (Decisão 4, plano 17). Cada handler devolve só o que interessa ao log; a
 * forma do retorno não precisa ser a mesma entre eles.
 */
const HANDLERS: Record<VlrJob, (key: string) => Promise<unknown>> = {
  [VLR_JOBS.scrapeMatch]: (key) => scrapeMatch(key),
  [VLR_JOBS.revalidateMatch]: (key) => revalidateMatch(key),
  [VLR_JOBS.scrapeRoster]: (key) => scrapeRoster(key),
};

const JOBS = Object.values(VLR_JOBS);

/**
 * Consome a fila: uma unidade de trabalho por vez, **falha isolada não
 * derruba o lote**. Cada iteração é uma transação de reivindicação, uma
 * requisição e uma transação de escrita — nada que segure um lock enquanto a
 * rede responde. `limit` é por chamada, não por tipo: os três disputam o
 * mesmo teto, na ordem de `VLR_JOBS`.
 */
export async function workQueue(
  options: { limit?: number } = {},
): Promise<{ done: number; failed: number }> {
  const limit = options.limit ?? 10;
  let done = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = await claimAny();
    if (!job) break;

    const startedAt = Date.now();
    try {
      const result = await HANDLERS[job.job as VlrJob](job.key);
      await db.transaction((tx) => complete(tx, job.id));
      done += 1;
      logInfo("vlr.job.done", {
        job: job.job,
        key: job.key,
        durationMs: Date.now() - startedAt,
        result,
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

  // Uma vez por lote, nunca por partida (fato 12, plano 20): a função varre
  // o catálogo inteiro, e só vale a pena rodar se algo mudou de fato.
  if (done > 0) {
    await db.transaction((tx) => refreshPlayerForm(tx));
  }

  logInfo("vlr.work.finished", { done, failed });
  return { done, failed };
}

/** Reivindica a próxima unidade elegível, de qualquer um dos três jobs. */
async function claimAny() {
  for (const job of JOBS) {
    const claimed = await db.transaction((tx) => claim(tx, job));
    if (claimed) return claimed;
  }
  return null;
}
