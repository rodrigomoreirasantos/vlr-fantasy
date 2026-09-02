"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { normalizeUsernameInput } from "@/lib/auth/username";
import { inviteBlockMessage } from "@/lib/championship/format";
import {
  findUserByUsername,
  inviteUserToChampionship,
} from "@/lib/championship/queries";
import { isUniqueViolation } from "@/lib/db/errors";
import { canonicalPair } from "@/lib/friendship/pair";
import {
  deleteFriendship,
  findFriendshipByPair,
  lockFriendshipForUpdate,
  updateFriendshipStatus,
  upsertFriendRequest,
} from "@/lib/friendship/queries";
import { ActionError, authActionClient } from "@/lib/safe-action";
import {
  updateTeamCrestForUser,
  updateTeamNameForUser,
} from "@/lib/team/queries";
import { normalizeTeamName } from "@/lib/team/team-name";
import {
  crestSchema,
  inviteFriendToChampionshipSchema,
  removeFriendSchema,
  respondToFriendRequestSchema,
  sendFriendRequestSchema,
  updateTeamNameSchema,
} from "@/lib/validations/profile";

/**
 * Renomeia o time do usuário. O banco (`fantasy_team_name_uidx`) é a
 * autoridade sobre a unicidade — checar antes com um `SELECT` deixaria
 * brecha entre abas; a violação é capturada aqui e traduzida.
 */
export const updateTeamName = authActionClient
  .inputSchema(updateTeamNameSchema)
  .action(async ({ parsedInput, ctx }) => {
    const name = normalizeTeamName(parsedInput.name);

    try {
      await db.transaction((tx) => updateTeamNameForUser(tx, ctx.userId, name));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ActionError(
          "Já existe um time com esse nome. Escolha outro.",
        );
      }
      throw error;
    }

    revalidatePath("/profile");
    return { success: true as const };
  });

/** Atualiza o brasão do time do usuário. */
export const updateTeamCrest = authActionClient
  .inputSchema(crestSchema)
  .action(async ({ parsedInput, ctx }) => {
    await db.transaction((tx) =>
      updateTeamCrestForUser(tx, ctx.userId, parsedInput),
    );

    revalidatePath("/profile");
    return { success: true as const };
  });

/**
 * Envia (ou reenvia) um pedido de amizade pelo login (`@handle`). Um pedido
 * recusado anteriormente é reaproveitado — nunca duplicado, graças a
 * `friendship_pair_uidx`.
 */
export const sendFriendRequest = authActionClient
  .inputSchema(sendFriendRequestSchema)
  .action(async ({ parsedInput, ctx }) => {
    const normalizedUsername = normalizeUsernameInput(parsedInput.username);

    await db.transaction(async (tx) => {
      const targetUser = await findUserByUsername(tx, normalizedUsername);
      if (!targetUser) {
        throw new ActionError(
          `Não encontramos ninguém com o login @${normalizedUsername}.`,
        );
      }

      const pair = canonicalPair(ctx.userId, targetUser.id);
      if (!pair) {
        throw new ActionError("Você não pode adicionar a si mesmo.");
      }

      const inserted = await upsertFriendRequest(tx, {
        pair,
        requesterId: ctx.userId,
      });
      if (!inserted) {
        const existing = await findFriendshipByPair(tx, pair);
        throw new ActionError(
          existing?.status === "accepted"
            ? "Vocês já são amigos."
            : "Você já enviou um pedido para essa pessoa.",
        );
      }
    });

    revalidatePath("/profile");
    return { success: true as const };
  });

/** Aceita ou recusa um pedido de amizade recebido pelo próprio usuário. */
export const respondToFriendRequest = authActionClient
  .inputSchema(respondToFriendRequestSchema)
  .action(async ({ parsedInput, ctx }) => {
    await db.transaction(async (tx) => {
      const record = await lockFriendshipForUpdate(
        tx,
        parsedInput.friendshipId,
      );
      if (
        !record ||
        (record.userAId !== ctx.userId && record.userBId !== ctx.userId)
      ) {
        throw new ActionError("Este pedido não é seu.");
      }
      if (record.requesterId === ctx.userId) {
        throw new ActionError("Você não pode responder ao próprio pedido.");
      }
      if (record.status !== "pending") {
        throw new ActionError("Este pedido já foi respondido.");
      }

      await updateFriendshipStatus(tx, {
        id: parsedInput.friendshipId,
        status: parsedInput.accept ? "accepted" : "declined",
      });
    });

    revalidatePath("/profile");
    return { success: true as const };
  });

/** Desfaz uma amizade — qualquer um dos dois lados pode remover. */
export const removeFriend = authActionClient
  .inputSchema(removeFriendSchema)
  .action(async ({ parsedInput, ctx }) => {
    await db.transaction(async (tx) => {
      const record = await lockFriendshipForUpdate(
        tx,
        parsedInput.friendshipId,
      );
      if (
        !record ||
        (record.userAId !== ctx.userId && record.userBId !== ctx.userId)
      ) {
        throw new ActionError("Esta amizade não é sua.");
      }

      await deleteFriendship(tx, parsedInput.friendshipId);
    });

    revalidatePath("/profile");
    return { success: true as const };
  });

/**
 * Convida um amigo para um campeonato próprio. Reaproveita a mesma regra de
 * bloqueio de `inviteMember` (app/(app)/ranking/actions.ts), via
 * `inviteUserToChampionship`.
 */
export const inviteFriendToChampionship = authActionClient
  .inputSchema(inviteFriendToChampionshipSchema)
  .action(async ({ parsedInput, ctx }) => {
    await db.transaction(async (tx) => {
      const result = await inviteUserToChampionship(tx, {
        championshipId: parsedInput.championshipId,
        ownerId: ctx.userId,
        targetUserId: parsedInput.friendUserId,
      });
      if (!result.ok) {
        throw new ActionError(inviteBlockMessage(result.reason));
      }
    });

    revalidatePath("/profile");
    revalidatePath("/ranking");
    return { success: true as const };
  });
