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
  /** Chave: o `vlrId` da partida — a releitura tardia (Decisão 5, plano 17). */
  revalidateMatch: "revalidate-match",
  /** Chave: o `vlrId` do time — o elenco (Decisão 4, plano 17). */
  scrapeRoster: "scrape-roster",
} as const;

export type VlrJob = (typeof VLR_JOBS)[keyof typeof VLR_JOBS];

/**
 * Desfecho de uma **execução completa** de um script `vlr:*` (`vlr_job_health`)
 * — não confundir com `VLR_JOB_STATUSES`, que é o estado de uma unidade de
 * trabalho dentro da fila. Um script pode terminar `ok` mesmo processando
 * zero unidades (nada a fazer é sucesso).
 */
export const VLR_JOB_HEALTH_STATUSES = ["ok", "failed"] as const;

export type VlrJobHealthStatus = (typeof VLR_JOB_HEALTH_STATUSES)[number];
