"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { normalizeUsernameInput } from "@/lib/auth/username";
import {
  findMembership,
  findUserByUsername,
  getChampionship,
  insertChampionshipWithOwner,
  lockMembershipForUpdate,
  updateMembershipStatus,
  upsertPendingMember,
} from "@/lib/championship/queries";
import { ActionError, authActionClient } from "@/lib/safe-action";
import {
  createChampionshipSchema,
  inviteMemberSchema,
  respondToInviteSchema,
} from "@/lib/validations/championship";

/**
 * Cria um campeonato e já entra o criador como membro aceito — sem isso,
 * quem criou um campeonato não apareceria na própria classificação.
 */
export const createChampionship = authActionClient
  .inputSchema(createChampionshipSchema)
  .action(async ({ parsedInput, ctx }) => {
    const championshipId = await db.transaction((tx) =>
      insertChampionshipWithOwner(tx, {
        name: parsedInput.name,
        ownerId: ctx.userId,
      }),
    );

    revalidatePath("/ranking");
    return { championshipId };
  });

/**
 * Convida um usuário para o campeonato pelo login (`@handle`). Só o dono
 * pode convidar. Um convite recusado anteriormente é reaproveitado — nunca
 * duplicado, graças ao `championship_member_unique_uidx`.
 */
export const inviteMember = authActionClient
  .inputSchema(inviteMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const normalizedUsername = normalizeUsernameInput(parsedInput.username);

    await db.transaction(async (tx) => {
      const targetChampionship = await getChampionship(
        parsedInput.championshipId,
        tx,
      );
      if (!targetChampionship || targetChampionship.ownerId !== ctx.userId) {
        throw new ActionError("Só quem criou o campeonato pode convidar.");
      }

      const targetUser = await findUserByUsername(tx, normalizedUsername);
      if (!targetUser) {
        throw new ActionError(
          `Não encontramos ninguém com o login @${normalizedUsername}.`,
        );
      }
      if (targetUser.id === ctx.userId) {
        throw new ActionError("Você já está neste campeonato.");
      }

      const inserted = await upsertPendingMember(tx, {
        championshipId: parsedInput.championshipId,
        userId: targetUser.id,
        invitedById: ctx.userId,
      });

      if (!inserted) {
        const existing = await findMembership(tx, {
          championshipId: parsedInput.championshipId,
          userId: targetUser.id,
        });
        throw new ActionError(
          existing?.status === "accepted"
            ? "Esse jogador já está no campeonato."
            : "Esse jogador já foi convidado.",
        );
      }
    });

    revalidatePath("/ranking");
    return { success: true as const };
  });

/**
 * Aceita ou recusa um convite de campeonato recebido pelo próprio usuário.
 */
export const respondToInvite = authActionClient
  .inputSchema(respondToInviteSchema)
  .action(async ({ parsedInput, ctx }) => {
    await db.transaction(async (tx) => {
      const member = await lockMembershipForUpdate(tx, parsedInput.memberId);
      if (!member || member.userId !== ctx.userId) {
        throw new ActionError("Este convite não é seu.");
      }
      if (member.status !== "pending") {
        throw new ActionError("Este convite já foi respondido.");
      }

      await updateMembershipStatus(tx, {
        memberId: parsedInput.memberId,
        status: parsedInput.accept ? "accepted" : "declined",
      });
    });

    revalidatePath("/ranking");
    return { success: true as const };
  });
