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

export const FRIENDSHIP_STATUSES = ["pending", "accepted", "declined"] as const;
export const friendshipStatus = pgEnum(
  "friendship_status",
  FRIENDSHIP_STATUSES,
);

export const friendship = pgTable(
  "friendship",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Par canônico: userAId < userBId sempre (ver `canonicalPair`,
    // lib/friendship/pair.ts). É o que impede A→B e B→A coexistirem, usando
    // colunas simples — assim o `onConflictDoUpdate` funciona com alvo de
    // coluna, igual a `upsertPendingMember` (lib/championship/queries.ts).
    userAId: text("user_a_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userBId: text("user_b_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Quem enviou o pedido — sempre igual a userAId ou userBId.
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: friendshipStatus("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("friendship_pair_uidx").on(table.userAId, table.userBId),
    index("friendship_user_a_status_idx").on(table.userAId, table.status),
    index("friendship_user_b_status_idx").on(table.userBId, table.status),
  ],
);
