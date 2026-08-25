import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { PlayerRole } from "@/lib/team/types";

// Import unidirecional: o schema conhece o tipo de domínio, nunca o
// contrário. `satisfies` faz a compilação falhar se os labels do enum
// divergirem do tipo de domínio, sem redeclarar nada.
export const PLAYER_ROLES = [
  "Duelista",
  "Iniciador",
  "Controlador",
  "Sentinela",
] as const satisfies readonly PlayerRole[];

export const playerRole = pgEnum("player_role", PLAYER_ROLES);

export const player = pgTable(
  "player",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nickname: text("nickname").notNull(),
    /** Organização do jogador na vida real, ex. "FNATIC". */
    team: text("team").notNull(),
    agent: text("agent").notNull(),
    role: playerRole("role").notNull(),
    /**
     * Preço no catálogo, em centavos de crédito. Nunca misturar com `score`:
     * o sufixo `Cents` marca tudo que é moeda.
     */
    priceCents: integer("price_cents").notNull(),
    /** Pontuação acumulada na rodada corrente. `score` nunca entra em conta de dinheiro. */
    score: numeric("score", { precision: 6, scale: 1, mode: "number" })
      .notNull()
      .default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("player_nickname_uidx").on(table.nickname),
    // Query exata do mercado: candidatos ativos de uma função.
    index("player_role_active_idx").on(table.role, table.active),
    check("player_price_cents_positive", sql`${table.priceCents} > 0`),
  ],
);
