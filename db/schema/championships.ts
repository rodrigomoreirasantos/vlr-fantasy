import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "@/db/schema/auth";
import { eventRegionEnum } from "@/db/schema/players";

export const championship = pgTable(
  "championship",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * A região deste campeonato — a classificação (`getStandingRows*`) junta
     * só o time daquela região de cada membro. `TeamRegion`, nunca `"other"`.
     */
    region: eventRegionEnum("region").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("championship_owner_idx").on(table.ownerId),
    index("championship_region_idx").on(table.region),
    check("championship_region_is_team", sql`${table.region} <> 'other'`),
    // Nome único globalmente, ignorando maiúsculas e espaços nas bordas —
    // mesma chave e mesmo espírito de `fantasy_identity_name_uidx`.
    uniqueIndex("championship_name_uidx").on(sql`lower(btrim(${table.name}))`),
  ],
);

export const CHAMPIONSHIP_MEMBER_STATUSES = [
  "pending",
  "accepted",
  "declined",
] as const;
export const championshipMemberStatus = pgEnum(
  "championship_member_status",
  CHAMPIONSHIP_MEMBER_STATUSES,
);

export const championshipMember = pgTable(
  "championship_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    championshipId: uuid("championship_id")
      .notNull()
      .references(() => championship.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: championshipMemberStatus("status").notNull().default("pending"),
    invitedById: text("invited_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    // Um usuário não pode ter dois registros de convite/membro no mesmo
    // campeonato — um convite recusado é reaproveitado (volta a "pending"),
    // nunca duplicado.
    uniqueIndex("championship_member_unique_uidx").on(
      table.championshipId,
      table.userId,
    ),
    index("championship_member_user_status_idx").on(table.userId, table.status),
  ],
);
