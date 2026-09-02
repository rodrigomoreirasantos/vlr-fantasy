import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { fantasyTeam } from "@/db/schema/fantasy-teams";
import { player } from "@/db/schema/players";
import { round } from "@/db/schema/rounds";

/**
 * Os três snapshots que `closeActiveRound` (db/close-round.ts) grava, sempre
 * juntos, na mesma transação de fechamento de rodada. Nenhum tem `uuid` +
 * índice único: nunca são referenciadas por FK, só lidas por
 * `(rodada, alguém)` — a PK composta já é a própria chave de acesso.
 */

/** Pontuação e preço de cada jogador do catálogo, congelados no fechamento. */
export const roundPlayerScore = pgTable(
  "round_player_score",
  {
    roundId: uuid("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id, { onDelete: "cascade" }),
    points: numeric("points", {
      precision: 6,
      scale: 1,
      mode: "number",
    }).notNull(),
    priceBeforeCents: integer("price_before_cents").notNull(),
    priceAfterCents: integer("price_after_cents").notNull(),
    // Denormalizado de propósito: é a chave de ordenação dos destaques
    // ("maiores valorizações"), e um índice por expressão sobre a subtração
    // custaria `sql` cru no schema.
    priceDeltaCents: integer("price_delta_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.playerId] }),
    index("round_player_score_points_idx").on(t.roundId, t.points.desc()),
    index("round_player_score_delta_idx").on(
      t.roundId,
      t.priceDeltaCents.desc(),
    ),
    check(
      "round_player_score_delta_consistent",
      sql`${t.priceDeltaCents} = ${t.priceAfterCents} - ${t.priceBeforeCents}`,
    ),
  ],
);

/** Resultado de um time fantasy numa rodada — o que a classificação lê. */
export const roundTeamResult = pgTable(
  "round_team_result",
  {
    roundId: uuid("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "cascade" }),
    fantasyTeamId: uuid("fantasy_team_id")
      .notNull()
      .references(() => fantasyTeam.id, { onDelete: "cascade" }),
    /** Total já com o multiplicador de capitão — o número que a Home e a classificação leem. */
    points: numeric("points", {
      precision: 8,
      scale: 1,
      mode: "number",
    }).notNull(),
    balanceCents: integer("balance_cents").notNull(),
    /** Soma dos preços das 5 vagas antes da repreçificação: o valor do elenco durante a rodada. */
    squadValueCents: integer("squad_value_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.fantasyTeamId] }),
    index("round_team_result_points_idx").on(t.roundId, t.points.desc()),
    index("round_team_result_team_idx").on(t.fantasyTeamId),
  ],
);

/** As cinco vagas da escalação de um time, congeladas no fechamento. */
export const roundRoster = pgTable(
  "round_roster",
  {
    roundId: uuid("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "cascade" }),
    fantasyTeamId: uuid("fantasy_team_id")
      .notNull()
      .references(() => fantasyTeam.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** `null` = a vaga estava vazia na virada. */
    playerId: uuid("player_id").references(() => player.id, {
      onDelete: "set null",
    }),
    captain: boolean("captain").notNull().default(false),
    /** Pontos brutos do jogador. O ×2 do capitão é aplicado por `teamPoints`, nunca gravado aqui. */
    points: numeric("points", { precision: 6, scale: 1, mode: "number" })
      .notNull()
      .default(0),
    priceCents: integer("price_cents").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.fantasyTeamId, t.position] }),
    check("round_roster_position_range", sql`${t.position} BETWEEN 1 AND 5`),
  ],
);
