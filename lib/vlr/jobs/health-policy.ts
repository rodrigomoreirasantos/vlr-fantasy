/**
 * Quanto tempo sem terminar com sucesso um job pode ficar antes de virar
 * sintoma de "o agendador parou" — a base do `healthcheck` do container
 * (Fase 6/7 do plano 17). Cadência apertada para os jobs de partida ao vivo,
 * folgada para os diários e semanais.
 */
export const JOB_MAX_AGE_MS: Readonly<Record<string, number>> = {
  "vlr:results": 5 * 60_000,
  "vlr:work": 5 * 60_000,
  "vlr:round": 20 * 60_000,
  "vlr:revalidate": 90 * 60_000,
  "vlr:schedule": 8 * 60 * 60_000,
  "vlr:rosters": 30 * 60 * 60_000,
  "vlr:regions": 30 * 60 * 60_000,
  "vlr:activate-reviewed": 30 * 60 * 60_000,
  "vlr:doctor": 30 * 60 * 60_000,
  "vlr:events": 8 * 24 * 60 * 60_000,
};

export type JobHealthRow = {
  job: string;
  lastFinishedAt: Date | null;
  lastStatus: "ok" | "failed" | null;
};

/**
 * Quais jobs (dentre os de `JOB_MAX_AGE_MS`) estão atrasados, nunca rodaram,
 * ou terminaram em falha — pura, recebe as linhas já lidas do banco
 * (`vlr_job_health`). Job que nunca rodou é exatamente o sintoma de "subi o
 * container e o cron não está disparando", por isso conta como atrasado.
 */
export function staleJobs(rows: readonly JobHealthRow[], now: Date): string[] {
  const byJob = new Map(rows.map((row) => [row.job, row]));
  const stale: string[] = [];

  for (const job of Object.keys(JOB_MAX_AGE_MS)) {
    const row = byJob.get(job);

    if (!row || !row.lastFinishedAt || row.lastStatus === "failed") {
      stale.push(job);
      continue;
    }

    const age = now.getTime() - row.lastFinishedAt.getTime();
    if (age > JOB_MAX_AGE_MS[job]) {
      stale.push(job);
    }
  }

  return stale;
}
