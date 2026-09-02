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
import { DEFAULT_CREST } from "@/lib/crest/crest";

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
    // Brasão do time: dado, não imagem — forma + símbolo + 3 cores de
    // paleta, desenhadas por `<TeamCrest>` (components/crest/team-crest.tsx).
    // `text` em vez de `pgEnum`: o catálogo de símbolos (lib/crest/catalog.ts)
    // vai crescer, e cada valor novo num enum do Postgres exigiria uma
    // migration. `parseCrest` (lib/crest/crest.ts) valida na borda e cai no
    // default campo a campo, então um `text` fora do catálogo nunca quebra.
    crestShape: text("crest_shape").notNull().default(DEFAULT_CREST.shape),
    crestSymbol: text("crest_symbol").notNull().default(DEFAULT_CREST.symbol),
    crestBg: text("crest_bg").notNull().default(DEFAULT_CREST.background),
    crestFg: text("crest_fg").notNull().default(DEFAULT_CREST.foreground),
    crestBorder: text("crest_border").notNull().default(DEFAULT_CREST.border),
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
    // Nome do time único, ignorando maiúsculas e espaços nas bordas — "não se
    // pode em hipótese alguma ter times com nomes iguais". Índice com
    // expressão exige nome explícito no Drizzle.
    uniqueIndex("fantasy_team_name_uidx").on(sql`lower(btrim(${table.name}))`),
  ],
);
