import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { round } from "@/db/schema/rounds";
import { vlrEvent } from "@/db/schema/vlr";
import { MATCH_STATUSES } from "@/lib/round/types";

// Mesmo import unidirecional de `PLAYER_ROLES`/`PLAYER_AVAILABILITIES`
// (db/schema/players.ts): a lista vive na camada de domínio e o schema a
// consome — nunca duas cópias que podem divergir em silêncio.
export const matchStatus = pgEnum("match_status", MATCH_STATUSES);

/** O calendário oficial da rodada — todas as partidas, não só as dos seus 5. */
export const match = pgTable(
  "match",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Id externo do vlr.gg — a chave natural que `match` nunca teve. */
    vlrId: text("vlr_id"),
    /**
     * **Nullable, e `set null` em vez de `cascade`.** Uma partida de evento
     * fora de escopo, ou de uma semana para a qual ainda não existe rodada,
     * precisa poder existir; e apagar uma rodada não pode sumir com o
     * calendário que a alimentou.
     */
    roundId: uuid("round_id").references(() => round.id, {
      onDelete: "set null",
    }),
    eventId: uuid("event_id").references(() => vlrEvent.id, {
      onDelete: "set null",
    }),
    // Texto, não FK: `player.team` também é o nome solto da organização
    // ("FNATIC"). Normalizar as duas pontas de uma vez é uma refatoração
    // maior do que esta fatia — o cruzamento é por igualdade de texto.
    teamA: text("team_a").notNull(),
    teamB: text("team_b").notNull(),
    event: text("event").notNull(), // "VCT Americas"
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: matchStatus("status").notNull().default("upcoming"),
    scoreA: integer("score_a"),
    scoreB: integer("score_b"),
    /** Formato da série ("Bo3" → 3). */
    bestOf: integer("best_of"),
    /**
     * Quando o scoreboard foi extraído. Substitui um status `SCRAPED` no enum:
     * "finalizada E extraída" fica derivada de um fato, não de dois campos que
     * podem divergir — e a regra de cache permanente vira uma cláusula
     * `WHERE scraped_at IS NULL`.
     */
    scrapedAt: timestamp("scraped_at", { withTimezone: true }),
    /** Caminho do HTML bruto salvo — o que sustenta `pnpm vlr:reprocess`. */
    rawHtmlPath: text("raw_html_path"),
    /**
     * Digital (`fingerprint`) do payload interpretado na última extração —
     * a base da releitura tardia (Decisão 5, plano 17): payload idêntico não
     * regrava nada.
     */
    contentHash: text("content_hash"),
    /** A releitura tardia já aconteceu — no máximo uma vez por partida. */
    revalidatedAt: timestamp("revalidated_at", { withTimezone: true }),
    /**
     * Primeira varredura de `/matches` em que este card sumiu (Decisão 6,
     * plano 17). Card visto de novo volta a `null` — ressurreição automática.
     */
    missingSince: timestamp("missing_since", { withTimezone: true }),
    /**
     * Confirmada sumida — ausente em 2 varreduras seguidas. **É esta coluna
     * que toda leitura de calendário, mercado e fechamento de rodada passa a
     * filtrar** (`dismissed_at IS NULL`); a linha e o histórico continuam no
     * banco, só param de contar.
     */
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    index("match_round_scheduled_idx").on(t.roundId, t.scheduledAt),
    uniqueIndex("match_vlr_id_uidx").on(t.vlrId),
    // A query do worker: partidas encerradas que ainda não foram extraídas.
    index("match_scraped_idx").on(t.status, t.scrapedAt),
    // Toda leitura "ativa" filtra por isto — parcial porque a maioria das
    // linhas nunca é descartada, e o índice cheio não ajudaria em nada.
    index("match_dismissed_idx")
      .on(t.dismissedAt)
      .where(sql`${t.dismissedAt} IS NULL`),
    // O enfileirador da releitura tardia (Fase 4): candidatas por janela.
    index("match_revalidated_scraped_idx").on(t.revalidatedAt, t.scrapedAt),
    check("match_distinct_orgs", sql`${t.teamA} <> ${t.teamB}`),
    // Placar é par: ou os dois lados existem, ou nenhum.
    check(
      "match_score_pairing",
      sql`(${t.scoreA} IS NULL) = (${t.scoreB} IS NULL)`,
    ),
  ],
);
