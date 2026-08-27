import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { fantasyTeam } from "@/db/schema/fantasy-teams";
import { player } from "@/db/schema/players";
import { round } from "@/db/schema/rounds";
import { rosterSlot } from "@/db/schema/roster";

/**
 * Histórico de substituições. Preços são snapshot — o histórico não se
 * distorce quando o catálogo reprecificar. Existir esta tabela é o que torna
 * auditável qualquer divergência de saldo.
 */
export const transfer = pgTable(
  "transfer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fantasyTeamId: uuid("fantasy_team_id")
      .notNull()
      .references(() => fantasyTeam.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "restrict" }),
    rosterSlotId: uuid("roster_slot_id")
      .notNull()
      .references(() => rosterSlot.id, { onDelete: "cascade" }),
    outPlayerId: uuid("out_player_id").references(() => player.id, {
      onDelete: "restrict",
    }),
    // `null` numa venda pura: a vaga esvazia e ninguém entra no lugar —
    // espelho de `outPlayerId`, que já é `null` numa contratação em vaga
    // vazia.
    inPlayerId: uuid("in_player_id").references(() => player.id, {
      onDelete: "restrict",
    }),
    outPriceCents: integer("out_price_cents").notNull().default(0),
    inPriceCents: integer("in_price_cents").notNull().default(0),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("transfer_team_round_idx").on(table.fantasyTeamId, table.roundId),
    index("transfer_team_created_idx").on(table.fantasyTeamId, table.createdAt),
    // Nunca uma linha sem jogador nenhum — só compra (in), só venda (out)
    // ou substituição (os dois).
    check(
      "transfer_has_player",
      sql`${table.inPlayerId} IS NOT NULL OR ${table.outPlayerId} IS NOT NULL`,
    ),
  ],
);
