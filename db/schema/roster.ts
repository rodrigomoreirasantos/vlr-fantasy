import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { fantasyTeam } from "@/db/schema/fantasy-teams";
import { player } from "@/db/schema/players";

// Não há `role` na vaga: qualquer função pode ocupar qualquer vaga — o
// usuário pode escalar cinco Duelistas se quiser (lib/market/eligibility.ts).
export const rosterSlot = pgTable(
  "roster_slot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fantasyTeamId: uuid("fantasy_team_id")
      .notNull()
      .references(() => fantasyTeam.id, { onDelete: "cascade" }),
    /** 1 a 5 — as cinco vagas fixas da escalação. */
    position: integer("position").notNull(),
    /** `null` = vaga vazia. */
    playerId: uuid("player_id").references(() => player.id, {
      onDelete: "restrict",
    }),
    captain: boolean("captain").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Cinco vagas fixas por time.
    uniqueIndex("roster_slot_team_position_uidx").on(
      table.fantasyTeamId,
      table.position,
    ),
    // O mesmo jogador não se repete no time. `NULLS DISTINCT` (padrão do
    // Postgres) deixa várias vagas vazias conviverem — rede de segurança
    // contra duas abas comprando o mesmo jogador.
    uniqueIndex("roster_slot_team_player_uidx").on(
      table.fantasyTeamId,
      table.playerId,
    ),
    uniqueIndex("roster_slot_single_captain_uidx")
      .on(table.fantasyTeamId)
      .where(sql`${table.captain}`),
    index("roster_slot_player_idx").on(table.playerId),
    check("roster_slot_position_range", sql`${table.position} BETWEEN 1 AND 5`),
  ],
);
