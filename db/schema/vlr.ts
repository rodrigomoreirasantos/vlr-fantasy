import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  VLR_JOB_HEALTH_STATUSES,
  VLR_JOB_STATUSES,
} from "@/lib/vlr/jobs/types";

/**
 * A camada de ingestão do vlr.gg: o catálogo de eventos e a fila de trabalho.
 * Fica separada das tabelas do jogo de propósito — apagar tudo daqui e
 * reprocessar do HTML salvo não pode tocar em saldo, escalação ou histórico.
 */

/** Campeonato do vlr.gg. */
export const vlrEvent = pgTable(
  "vlr_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Id externo — a chave natural, o que torna todo upsert idempotente. */
    vlrId: text("vlr_id").notNull(),
    name: text("name").notNull(),
    /** Código de duas letras vindo da classe da bandeira ("kr"), ver `parse.ts`. */
    region: text("region"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Como o vlr rotula: "ongoing", "upcoming", "completed". */
    status: text("status").notNull().default("unknown"),
    /**
     * **A allowlist.** Só evento marcado à mão gera rodada e entra no catálogo
     * de jogadores — o vlr tem centenas de campeonatos, e o fantasy é sobre
     * alguns poucos. O scraper nunca escreve nesta coluna.
     */
    tracked: boolean("tracked").notNull().default(false),
    /**
     * O veto humano sobre `applyAutoTracking` (Decisão 3, plano 17). `null` =
     * o automático decide (regra de circuito, `lib/vlr/normalize/tracking.ts`);
     * `true`/`false` = a pessoa decidiu, e o automático nunca escreve por cima
     * — só ela muda esta coluna, pelo `pnpm db:studio`.
     */
    trackedOverride: boolean("tracked_override"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("vlr_event_vlr_id_uidx").on(t.vlrId),
    index("vlr_event_tracked_idx").on(t.tracked),
  ],
);

export const vlrJobStatus = pgEnum("vlr_job_status", VLR_JOB_STATUSES);

/**
 * A fila, no próprio Postgres. Sem Redis e sem worker de longa duração: os
 * scripts `vlr:*` rodam por cron, reivindicam trabalho com
 * `FOR UPDATE SKIP LOCKED` e saem. Uma dependência a menos para operar, e a
 * fila fica visível no mesmo `db:studio` que o resto do jogo.
 */
export const vlrJobRun = pgTable(
  "vlr_job_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    /** Chave natural da unidade de trabalho — ex. o `vlrId` da partida. */
    key: text("key").notNull(),
    status: vlrJobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Backoff: a linha só é reivindicável a partir deste instante. */
    runAfter: timestamp("run_after", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    // Enfileirar duas vezes a mesma partida é um upsert, não uma linha nova.
    uniqueIndex("vlr_job_run_job_key_uidx").on(t.job, t.key),
    // O índice exato do `claim`: próximo pendente elegível deste job.
    index("vlr_job_run_claim_idx").on(t.job, t.status, t.runAfter),
  ],
);

export const vlrJobHealthStatus = pgEnum(
  "vlr_job_health_status",
  VLR_JOB_HEALTH_STATUSES,
);

/**
 * O batimento de cada script `vlr:*` (Decisão 7, plano 17) — uma linha por
 * job, sempre a **última** execução completa. `runScript`
 * (`scripts/vlr/run.ts`) grava aqui no `finally`, para todo entrypoint, sem
 * cada script individual precisar saber que isto existe. É o que faz
 * "o container caiu" virar um fato no banco, e não um log que ninguém lê.
 */
export const vlrJobHealth = pgTable(
  "vlr_job_health",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    lastStatus: vlrJobHealthStatus("last_status"),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
    lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
    lastDurationMs: integer("last_duration_ms"),
    /** Resumo curto do que o job fez — o que hoje só existia no log JSON. */
    lastSummary: text("last_summary"),
    /** Mensagem de erro da última falha; `null` enquanto a última foi `ok`. */
    lastError: text("last_error"),
    /** Zera a cada sucesso — a base de "falhou 3x seguidas" do `vlr:health`. */
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("vlr_job_health_job_uidx").on(t.job)],
);

/**
 * A impressão digital de uma página de **lista** (`/matches`, `/events`) —
 * distinta de `match.contentHash`, que é por partida. Guarda a última digital
 * vista de cada caminho, para `pageChanged` (`lib/vlr/persist/page-state.ts`)
 * decidir se vale a pena reprocessar a resposta que acabou de chegar.
 */
export const vlrPageState = pgTable(
  "vlr_page_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    path: text("path").notNull(),
    contentHash: text("content_hash").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    /** Quando a digital mudou pela última vez — `null` até a primeira mudança. */
    changedAt: timestamp("changed_at", { withTimezone: true }),
    /** Quantas leituras seguidas vieram com a mesma digital. */
    unchangedRuns: integer("unchanged_runs").notNull().default(0),
  },
  (t) => [uniqueIndex("vlr_page_state_path_uidx").on(t.path)],
);
