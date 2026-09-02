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

import { PLAYER_AVAILABILITIES, PLAYER_ROLES } from "@/lib/team/types";

// Import unidirecional: o schema conhece o tipo de domínio, nunca o
// contrário. `PLAYER_ROLES` vive em `lib/team/types.ts` — única fonte da
// lista de funções, reaproveitada pela UI para agrupar o mercado.
export const playerRole = pgEnum("player_role", PLAYER_ROLES);

/** Estados do jogo (lista fechada) — não confundir com `active`, que é o catálogo do mercado. */
export const playerAvailability = pgEnum(
  "player_availability",
  PLAYER_AVAILABILITIES,
);

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
    /** Disponibilidade para a próxima rodada — alimenta os alertas da Home. */
    availability: playerAvailability("availability")
      .notNull()
      .default("available"),
    /** Detalhe opcional em pt-BR, ex. "Fora por lesão no pulso". */
    availabilityNote: text("availability_note"),
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
