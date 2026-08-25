import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "@/db/schema/auth";

/** 200.0 créditos — chute de balanceamento, fácil de ajustar. */
export const INITIAL_BALANCE_CENTS = 20_000;

// Nome `fantasy_team`, não `team`: "team" já significa a organização real em
// `player.team` — evitar a colisão semântica desde já.
export const fantasyTeam = pgTable(
  "fantasy_team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    balanceCents: integer("balance_cents")
      .notNull()
      .default(INITIAL_BALANCE_CENTS),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Um time por usuário; serve de índice da FK.
    uniqueIndex("fantasy_team_user_uidx").on(table.userId),
    check("fantasy_team_balance_non_negative", sql`${table.balanceCents} >= 0`),
  ],
);
