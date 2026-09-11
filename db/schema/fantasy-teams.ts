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
import { eventRegionEnum } from "@/db/schema/players";
import { STARTING_BUDGET_CENTS } from "@/lib/market/budget";

// Nome `fantasy_team`, não `team`: "team" já significa a organização real em
// `player.team` — evitar a colisão semântica desde já.
//
// Desde "um time por região" (`.claude/plans/10-time-por-regiao.md`), cada
// usuário tem até 5 linhas aqui — uma por `TeamRegion` — cada uma com o
// próprio saldo e o próprio elenco (`roster_slot`). Nome e brasão saíram
// para `fantasy_identity`: são do usuário, não de um time regional.
export const fantasyTeam = pgTable(
  "fantasy_team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * A região deste time — `TeamRegion` (`americas | emea | pacific | china
     * | international`). Nunca `"other"`: todo `fantasy_team` é um dos cinco
     * times de verdade, nunca o limbo de jogador sem liga.
     */
    region: eventRegionEnum("region").notNull(),
    /** 300,0 créditos (Decisão 1, plano 20). Igual para as 5 regiões. */
    balanceCents: integer("balance_cents")
      .notNull()
      .default(STARTING_BUDGET_CENTS),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Um time por usuário **por região** — substitui o antigo
    // `fantasy_team_user_uidx` (um time por usuário, período).
    uniqueIndex("fantasy_team_user_region_uidx").on(table.userId, table.region),
    // Faixa do saldo (Decisão 3, plano 20) — troca
    // `fantasy_team_balance_non_negative`. Condição necessária, não
    // suficiente: o teto real é sobre saldo + elenco
    // (`MAX_PATRIMONY_CENTS`, `lib/market/budget.ts`), que nenhum CHECK de
    // uma tabela só alcança — mas é a rede que impede um bug de crédito de
    // inflar o caixa sozinho. ⚠️ Um `CHECK` não aceita parâmetro de query —
    // o literal tem de bater com `MAX_PATRIMONY_CENTS`.
    check(
      "fantasy_team_balance_range",
      sql`${table.balanceCents} BETWEEN 0 AND 36000`,
    ),
    check("fantasy_team_region_is_team", sql`${table.region} <> 'other'`),
  ],
);
