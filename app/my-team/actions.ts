"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { evaluateSubstitution, blockReasonMessage } from "@/lib/market/eligibility";
import { isMarketOpen } from "@/lib/market/window";
import { ActionError, authActionClient } from "@/lib/safe-action";
import { toDomainPlayer } from "@/lib/team/mappers";
import {
  applySubstitution,
  getActiveRound,
  loadPlayersByIds,
  loadRosteredPlayerIds,
  lockSlotForUpdate,
  lockTeamForUpdate,
} from "@/lib/team/queries";
import { substitutePlayerSchema } from "@/lib/validations/market";

/**
 * Substitui um jogador da escalação por outro do mercado, respeitando as
 * quatro regras de produto (janela de mercado, saldo, função e "quem sai
 * define a vaga"). Toda a leitura e escrita acontece dentro de uma única
 * `db.transaction`, com os dados relidos do banco — nunca confiados ao
 * cliente — e a mesma `evaluateSubstitution` que a UI usa para habilitar o
 * botão "Contratar" decide se a troca é aceita.
 */
export const substitutePlayer = authActionClient
  .inputSchema(substitutePlayerSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { slotId, outgoingPlayerId, incomingPlayerId } = parsedInput;

    await db.transaction(async (tx) => {
      // Ordem de lock sempre time → vaga, para não deadlockar com outra
      // substituição concorrente do mesmo usuário.
      const team = await lockTeamForUpdate(tx, ctx.userId);
      if (!team) {
        throw new ActionError("Não encontramos seu time. Recarregue a página.");
      }

      const activeRound = await getActiveRound(tx);
      const marketOpen = activeRound
        ? isMarketOpen({ opensAt: activeRound.marketOpensAt, closesAt: activeRound.marketClosesAt })
        : false;

      const slot = await lockSlotForUpdate(tx, team.id, slotId);
      if (!slot || slot.playerId !== outgoingPlayerId) {
        throw new ActionError(
          "Essa vaga mudou enquanto você decidia. Recarregue a página.",
        );
      }

      const rows = await loadPlayersByIds(tx, [outgoingPlayerId, incomingPlayerId]);
      const outgoing = rows.find((row) => row.id === outgoingPlayerId);
      const incoming = rows.find((row) => row.id === incomingPlayerId);
      if (!outgoing || !incoming) {
        throw new ActionError("Jogador não encontrado no catálogo.");
      }

      const rosteredPlayerIds = await loadRosteredPlayerIds(tx, team.id);

      const verdict = evaluateSubstitution(
        {
          marketOpen,
          balanceCents: team.balanceCents,
          outgoing: toDomainPlayer(outgoing),
          rosteredPlayerIds,
        },
        toDomainPlayer(incoming),
      );

      if (verdict.blockedBy) {
        throw new ActionError(blockReasonMessage(verdict.blockedBy, outgoing.role));
      }
      // `marketOpen` só é `true` quando há rodada ativa — garantido acima.
      if (!activeRound) {
        throw new ActionError("Não há rodada ativa no momento.");
      }

      await applySubstitution(tx, {
        teamId: team.id,
        slotId,
        incomingPlayerId,
        outgoingPlayerId,
        roundId: activeRound.id,
        outPriceCents: outgoing.priceCents,
        inPriceCents: incoming.priceCents,
        balanceAfterCents: verdict.balanceAfterCents,
      });
    });

    revalidatePath("/my-team");
    return { success: true as const };
  });
