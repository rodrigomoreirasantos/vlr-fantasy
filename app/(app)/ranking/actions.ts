"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { normalizeUsernameInput } from "@/lib/auth/username";
import {
  findUserByUsername,
  insertChampionshipWithOwner,
  inviteUserToChampionship,
  lockMembershipForUpdate,
  updateMembershipStatus,
} from "@/lib/championship/queries";
import { inviteBlockMessage } from "@/lib/championship/format";
import { canonicalPair } from "@/lib/friendship/pair";
import { ensureFriendship } from "@/lib/friendship/queries";
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
      const targetUser = await findUserByUsername(tx, normalizedUsername);
      if (!targetUser) {
        throw new ActionError(
          `Não encontramos ninguém com o login @${normalizedUsername}.`,
        );
      }

      const result = await inviteUserToChampionship(tx, {
        championshipId: parsedInput.championshipId,
        ownerId: ctx.userId,
        targetUserId: targetUser.id,
      });
      if (!result.ok) {
        throw new ActionError(inviteBlockMessage(result.reason));
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

      // Auto-amizade: aceitar um convite de campeonato também cria (ou
      // reaproveita) o vínculo de amizade com quem convidou — na mesma
      // transação do aceite: ou entra tudo, ou nada.
      if (parsedInput.accept && member.invitedById) {
        const pair = canonicalPair(ctx.userId, member.invitedById);
        if (pair) await ensureFriendship(tx, pair);
      }
    });

    revalidatePath("/ranking");
    return { success: true as const };
  });
