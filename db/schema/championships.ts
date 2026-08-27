import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "@/db/schema/auth";

export const championship = pgTable(
  "championship",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("championship_owner_idx").on(table.ownerId)],
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
