import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { round } from "@/db/schema/rounds";
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
    roundId: uuid("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "cascade" }),
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
    check("match_distinct_orgs", sql`${t.teamA} <> ${t.teamB}`),
    // Placar é par: ou os dois lados existem, ou nenhum.
    check(
      "match_score_pairing",
      sql`(${t.scoreA} IS NULL) = (${t.scoreB} IS NULL)`,
    ),
  ],
);
