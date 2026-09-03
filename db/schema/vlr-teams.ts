import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * A organização real, do vlr. É a **fonte canônica do nome do time**:
 * `player.team` e `match.teamA`/`teamB` passam a receber `vlr_team.name`, o
 * que faz o cruzamento por igualdade de texto (`db/schema/matches.ts`) ser
 * confiável sem a refatoração maior que aquele comentário adia.
 */
export const vlrTeam = pgTable(
  "vlr_team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vlrId: text("vlr_id").notNull(),
    name: text("name").notNull(),
    /** Sigla do scoreboard, ex. "FLY". */
    tag: text("tag"),
    region: text("region"),
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("vlr_team_vlr_id_uidx").on(t.vlrId),
    index("vlr_team_name_idx").on(sql`lower(${t.name})`),
  ],
);
