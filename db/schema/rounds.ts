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

export const ROUND_STATUSES = ["upcoming", "active", "finished"] as const;

export const roundStatus = pgEnum("round_status", ROUND_STATUSES);

export const round = pgTable(
  "round",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull(),
    name: text("name"),
    marketOpensAt: timestamp("market_opens_at", {
      withTimezone: true,
    }).notNull(),
    marketClosesAt: timestamp("market_closes_at", {
      withTimezone: true,
    }).notNull(),
    /** Alimentam o card "Partidas Pontuadas" que `TeamStats` renderiza. */
    totalMatches: integer("total_matches").notNull().default(0),
    scoredMatches: integer("scored_matches").notNull().default(0),
    status: roundStatus("status").notNull().default("upcoming"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("round_number_uidx").on(table.number),
    // No máximo uma rodada ativa por vez.
    uniqueIndex("round_single_active_uidx")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    index("round_status_idx").on(table.status),
    check(
      "round_market_window_valid",
      sql`${table.marketClosesAt} > ${table.marketOpensAt}`,
    ),
    check(
      "round_scored_matches_within_total",
      sql`${table.scoredMatches} BETWEEN 0 AND ${table.totalMatches}`,
    ),
  ],
);
