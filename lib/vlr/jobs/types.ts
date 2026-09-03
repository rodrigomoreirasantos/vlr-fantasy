/**
 * Estados de uma unidade de trabalho da fila (`vlr_job_run`). Lista fechada —
 * são estados do processo, não um catálogo que cresce — por isso vira
 * `pgEnum` em `db/schema/vlr.ts`, que importa daqui. Mesmo import
 * unidirecional de `PLAYER_ROLES` e `MATCH_STATUSES`: a lista vive na camada
 * de domínio e o schema a consome.
 */
export const VLR_JOB_STATUSES = [
  "pending",
  "running",
  "done",
  "failed",
  /** Dead letter queue: esgotou as tentativas e ninguém mais tenta sozinho. */
  "dead",
] as const;

export type VlrJobStatus = (typeof VLR_JOB_STATUSES)[number];

/** Os jobs do pipeline. Cada um consome uma fila com sua própria chave natural. */
export const VLR_JOBS = {
  /** Chave: o `vlrId` da partida. */
  scrapeMatch: "scrape-match",
} as const;

export type VlrJob = (typeof VLR_JOBS)[keyof typeof VLR_JOBS];
