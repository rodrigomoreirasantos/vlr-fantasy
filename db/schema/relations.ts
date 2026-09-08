import { relations } from "drizzle-orm";

import { user } from "@/db/schema/auth";
import { championship, championshipMember } from "@/db/schema/championships";
import { fantasyIdentity } from "@/db/schema/fantasy-identity";
import { fantasyTeam } from "@/db/schema/fantasy-teams";
import { friendship } from "@/db/schema/friendships";
import { match } from "@/db/schema/matches";
import { player } from "@/db/schema/players";
import { round } from "@/db/schema/rounds";
import {
  roundPlayerScore,
  roundRoster,
  roundTeamResult,
} from "@/db/schema/round-results";
import { rosterSlot } from "@/db/schema/roster";
import { transfer } from "@/db/schema/transfers";
import { playerMatchStat } from "@/db/schema/player-match-stats";
import { vlrEvent } from "@/db/schema/vlr";

// Todas as `relations()` das tabelas novas vivem aqui, para não criar ciclo
// de import entre players.ts ↔ roster.ts ↔ fantasy-teams.ts.

export const fantasyTeamRelations = relations(fantasyTeam, ({ one, many }) => ({
  user: one(user, {
    fields: [fantasyTeam.userId],
    references: [user.id],
  }),
  // Nome + brasão: um por usuário, não um por time regional — permite
  // `loadTeamOverview` resolver elenco e identidade numa consulta só.
  identity: one(fantasyIdentity, {
    fields: [fantasyTeam.userId],
    references: [fantasyIdentity.userId],
  }),
  slots: many(rosterSlot),
  transfers: many(transfer),
}));

export const fantasyIdentityRelations = relations(
  fantasyIdentity,
  ({ one }) => ({
    user: one(user, {
      fields: [fantasyIdentity.userId],
      references: [user.id],
    }),
  }),
);

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
  matchStats: many(playerMatchStat),
  incomingTransfers: many(transfer, { relationName: "incomingPlayer" }),
  outgoingTransfers: many(transfer, { relationName: "outgoingPlayer" }),
}));

export const roundRelations = relations(round, ({ many }) => ({
  transfers: many(transfer),
  matches: many(match),
  playerScores: many(roundPlayerScore),
  teamResults: many(roundTeamResult),
}));

export const matchRelations = relations(match, ({ one, many }) => ({
  round: one(round, {
    fields: [match.roundId],
    references: [round.id],
  }),
  event: one(vlrEvent, {
    fields: [match.eventId],
    references: [vlrEvent.id],
  }),
  playerStats: many(playerMatchStat),
}));

export const vlrEventRelations = relations(vlrEvent, ({ many }) => ({
  matches: many(match),
}));

export const playerMatchStatRelations = relations(
  playerMatchStat,
  ({ one }) => ({
    match: one(match, {
      fields: [playerMatchStat.matchId],
      references: [match.id],
    }),
    player: one(player, {
      fields: [playerMatchStat.playerId],
      references: [player.id],
    }),
  }),
);

export const roundPlayerScoreRelations = relations(
  roundPlayerScore,
  ({ one }) => ({
    round: one(round, {
      fields: [roundPlayerScore.roundId],
      references: [round.id],
    }),
    player: one(player, {
      fields: [roundPlayerScore.playerId],
      references: [player.id],
    }),
  }),
);

export const roundTeamResultRelations = relations(
  roundTeamResult,
  ({ one }) => ({
    round: one(round, {
      fields: [roundTeamResult.roundId],
      references: [round.id],
    }),
    fantasyTeam: one(fantasyTeam, {
      fields: [roundTeamResult.fantasyTeamId],
      references: [fantasyTeam.id],
    }),
  }),
);

export const roundRosterRelations = relations(roundRoster, ({ one }) => ({
  round: one(round, {
    fields: [roundRoster.roundId],
    references: [round.id],
  }),
  fantasyTeam: one(fantasyTeam, {
    fields: [roundRoster.fantasyTeamId],
    references: [fantasyTeam.id],
  }),
  player: one(player, {
    fields: [roundRoster.playerId],
    references: [player.id],
  }),
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

export const friendshipRelations = relations(friendship, ({ one }) => ({
  userA: one(user, {
    fields: [friendship.userAId],
    references: [user.id],
    relationName: "friendshipUserA",
  }),
  userB: one(user, {
    fields: [friendship.userBId],
    references: [user.id],
    relationName: "friendshipUserB",
  }),
  requester: one(user, {
    fields: [friendship.requesterId],
    references: [user.id],
    relationName: "friendshipRequester",
  }),
}));
