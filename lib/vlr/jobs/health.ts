import { db } from "@/db";
import { vlrJobHealth } from "@/db/schema";
import { JOB_MAX_AGE_MS, staleJobs } from "@/lib/vlr/jobs/health-policy";
import { logInfo } from "@/lib/vlr/http/log";

export type HealthReport = {
  healthy: boolean;
  stale: string[];
};

/**
 * `vlr:health` — **sem rede**: lê `vlr_job_health` e aplica `staleJobs`
 * (Fase 0, plano 17). É o que o `healthcheck` do `docker-compose.yml` chama;
 * sai com `healthy: false` quando algum job de `JOB_MAX_AGE_MS` está
 * atrasado, nunca rodou, ou terminou em falha.
 */
export async function runHealth(now: Date = new Date()): Promise<HealthReport> {
  const rows = await db
    .select({
      job: vlrJobHealth.job,
      lastFinishedAt: vlrJobHealth.lastFinishedAt,
      lastStatus: vlrJobHealth.lastStatus,
    })
    .from(vlrJobHealth);

  const stale = staleJobs(rows, now);
  const healthy = stale.length === 0;

  logInfo("vlr.health.checked", {
    healthy,
    stale,
    tracked: Object.keys(JOB_MAX_AGE_MS).length,
  });
  return { healthy, stale };
}
