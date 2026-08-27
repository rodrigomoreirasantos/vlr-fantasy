import { relations } from "drizzle-orm";

import { user } from "@/db/schema/auth";
import { championship, championshipMember } from "@/db/schema/championships";
import { fantasyTeam } from "@/db/schema/fantasy-teams";
import { player } from "@/db/schema/players";
import { round } from "@/db/schema/rounds";
import { rosterSlot } from "@/db/schema/roster";
import { transfer } from "@/db/schema/transfers";

// Todas as `relations()` das tabelas novas vivem aqui, para não criar ciclo
// de import entre players.ts ↔ roster.ts ↔ fantasy-teams.ts.

export const fantasyTeamRelations = relations(fantasyTeam, ({ one, many }) => ({
  user: one(user, {
    fields: [fantasyTeam.userId],
    references: [user.id],
  }),
  slots: many(rosterSlot),
  transfers: many(transfer),
}));

export const rosterSlotRelations = relations(rosterSlot, ({ one, many }) => ({
  fantasyTeam: one(fantasyTeam, {
    fields: [rosterSlot.fantasyTeamId],
    references: [fantasyTeam.id],
  }),
  player: one(player, {
    fields: [rosterSlot.playerId],
    references: [player.id],
  }),
  transfers: many(transfer),
}));

export const playerRelations = relations(player, ({ many }) => ({
  rosterSlots: many(rosterSlot),
  incomingTransfers: many(transfer, { relationName: "incomingPlayer" }),
  outgoingTransfers: many(transfer, { relationName: "outgoingPlayer" }),
}));

export const roundRelations = relations(round, ({ many }) => ({
  transfers: many(transfer),
}));

export const transferRelations = relations(transfer, ({ one }) => ({
  fantasyTeam: one(fantasyTeam, {
    fields: [transfer.fantasyTeamId],
    references: [fantasyTeam.id],
  }),
  round: one(round, {
    fields: [transfer.roundId],
    references: [round.id],
  }),
  rosterSlot: one(rosterSlot, {
    fields: [transfer.rosterSlotId],
    references: [rosterSlot.id],
  }),
  outPlayer: one(player, {
    fields: [transfer.outPlayerId],
    references: [player.id],
    relationName: "outgoingPlayer",
  }),
  inPlayer: one(player, {
    fields: [transfer.inPlayerId],
    references: [player.id],
    relationName: "incomingPlayer",
  }),
}));

export const championshipRelations = relations(
  championship,
  ({ one, many }) => ({
    owner: one(user, {
      fields: [championship.ownerId],
      references: [user.id],
    }),
    members: many(championshipMember),
  }),
);

export const championshipMemberRelations = relations(
  championshipMember,
  ({ one }) => ({
    championship: one(championship, {
      fields: [championshipMember.championshipId],
      references: [championship.id],
    }),
    user: one(user, {
      fields: [championshipMember.userId],
      references: [user.id],
      relationName: "championshipMemberUser",
    }),
    invitedBy: one(user, {
      fields: [championshipMember.invitedById],
      references: [user.id],
      relationName: "championshipMemberInvitedBy",
    }),
  }),
);
