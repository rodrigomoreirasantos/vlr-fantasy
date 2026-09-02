"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  evaluateSale,
  evaluateSubstitution,
  blockReasonMessage,
} from "@/lib/market/eligibility";
import { isMarketOpen } from "@/lib/market/window";
import { ActionError, authActionClient } from "@/lib/safe-action";
import { toDomainPlayer } from "@/lib/team/mappers";
import {
  applySale,
  applySubstitution,
  getActiveRound,
  hasCaptain,
  loadPlayersByIds,
  loadRosteredPlayerIds,
  lockSlotForUpdate,
  lockTeamForUpdate,
  setTeamCaptain,
} from "@/lib/team/queries";
import {
  sellPlayerSchema,
  setCaptainSchema,
  substitutePlayerSchema,
} from "@/lib/validations/market";

/**
 * Substitui um jogador da escalação por outro do mercado — ou preenche uma
 * vaga vazia, quando `outgoingPlayerId` é `null` — respeitando as regras de
 * produto (janela de mercado, saldo, função e "quem sai define a vaga").
 * Toda a leitura e escrita acontece dentro de uma única `db.transaction`,
 * com os dados relidos do banco — nunca confiados ao cliente — e a mesma
 * `evaluateSubstitution` que a UI usa para habilitar o botão "Contratar"
 * decide se a troca é aceita.
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
        ? isMarketOpen({
            opensAt: activeRound.marketOpensAt,
            closesAt: activeRound.marketClosesAt,
          })
        : false;

      const slot = await lockSlotForUpdate(tx, team.id, slotId);
      if (!slot || slot.playerId !== outgoingPlayerId) {
        throw new ActionError(
          "Essa vaga mudou enquanto você decidia. Recarregue a página.",
        );
      }

      const rows = await loadPlayersByIds(
        tx,
        outgoingPlayerId
          ? [outgoingPlayerId, incomingPlayerId]
          : [incomingPlayerId],
      );
      const outgoing = outgoingPlayerId
        ? rows.find((row) => row.id === outgoingPlayerId)
        : null;
      const incoming = rows.find((row) => row.id === incomingPlayerId);
      if (!incoming || (outgoingPlayerId && !outgoing)) {
        throw new ActionError("Jogador não encontrado no catálogo.");
      }

      const rosteredPlayerIds = await loadRosteredPlayerIds(tx, team.id);

      const verdict = evaluateSubstitution(
        {
          marketOpen,
          balanceCents: team.balanceCents,
          outgoing: outgoing ? toDomainPlayer(outgoing) : null,
          rosteredPlayerIds,
        },
        toDomainPlayer(incoming),
      );

      if (verdict.blockedBy) {
        throw new ActionError(blockReasonMessage(verdict.blockedBy));
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
        outPriceCents: outgoing?.priceCents ?? 0,
        inPriceCents: incoming.priceCents,
        balanceAfterCents: verdict.balanceAfterCents,
      });

      // Um time montado do zero não teria capitão até o usuário clicar no
      // "C" manualmente — a primeira contratação já entra como capitã.
      if (!outgoingPlayerId && !(await hasCaptain(tx, team.id))) {
        await setTeamCaptain(tx, team.id, slotId);
      }
    });

    revalidatePath("/my-team");
    // A Home mostra a escalação (alertas dos seus 5) e o patrimônio.
    revalidatePath("/home");
    return { success: true as const };
  });

/**
 * Vende um jogador escalado sem contratar ninguém no lugar: a vaga fica
 * vazia e o preço cheio dele é creditado no saldo. Mesmo padrão de
 * transação/lock de `substitutePlayer`, mas sem `incomingPlayerId` — quem
 * decide se a venda vale é `evaluateSale`, a mesma função que a UI usa para
 * habilitar o botão "Vender".
 */
export const sellPlayer = authActionClient
  .inputSchema(sellPlayerSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { slotId, outgoingPlayerId } = parsedInput;

    await db.transaction(async (tx) => {
      const team = await lockTeamForUpdate(tx, ctx.userId);
      if (!team) {
        throw new ActionError("Não encontramos seu time. Recarregue a página.");
      }

      const activeRound = await getActiveRound(tx);
      const marketOpen = activeRound
        ? isMarketOpen({
            opensAt: activeRound.marketOpensAt,
            closesAt: activeRound.marketClosesAt,
          })
        : false;

      const slot = await lockSlotForUpdate(tx, team.id, slotId);
      if (!slot || slot.playerId !== outgoingPlayerId) {
        throw new ActionError(
          "Essa vaga mudou enquanto você decidia. Recarregue a página.",
        );
      }

      const [outgoing] = await loadPlayersByIds(tx, [outgoingPlayerId]);
      if (!outgoing) {
        throw new ActionError("Jogador não encontrado no catálogo.");
      }

      const verdict = evaluateSale(
        { marketOpen, balanceCents: team.balanceCents },
        toDomainPlayer(outgoing),
      );
      if (verdict.blockedBy) {
        throw new ActionError(blockReasonMessage(verdict.blockedBy));
      }
      // `marketOpen` só é `true` quando há rodada ativa — garantido acima.
      if (!activeRound) {
        throw new ActionError("Não há rodada ativa no momento.");
      }

      await applySale(tx, {
        teamId: team.id,
        slotId,
        outgoingPlayerId,
        roundId: activeRound.id,
        outPriceCents: outgoing.priceCents,
        balanceAfterCents: verdict.balanceAfterCents,
      });
    });

    revalidatePath("/my-team");
    // A Home mostra a escalação (alertas dos seus 5) e o patrimônio.
    revalidatePath("/home");
    return { success: true as const };
  });

/**
 * Move a braçadeira de capitão para outra vaga da escalação, respeitando a
 * mesma regra de janela da substituição: só com o mercado aberto. Fora
 * disso, o capitão fica travado com o resto do time.
 */
export const setCaptain = authActionClient
  .inputSchema(setCaptainSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { slotId } = parsedInput;

    await db.transaction(async (tx) => {
      const team = await lockTeamForUpdate(tx, ctx.userId);
      if (!team) {
        throw new ActionError("Não encontramos seu time. Recarregue a página.");
      }

      const activeRound = await getActiveRound(tx);
      const marketOpen = activeRound
        ? isMarketOpen({
            opensAt: activeRound.marketOpensAt,
            closesAt: activeRound.marketClosesAt,
          })
        : false;
      if (!marketOpen) {
        throw new ActionError("A janela de mercado está fechada.");
      }

      const slot = await lockSlotForUpdate(tx, team.id, slotId);
      if (!slot || !slot.playerId) {
        throw new ActionError("Essa vaga não tem jogador para ser capitão.");
      }
      if (slot.captain) return;

      await setTeamCaptain(tx, team.id, slotId);
    });

    revalidatePath("/my-team");
    // A Home mostra a escalação (alertas dos seus 5) e o patrimônio.
    revalidatePath("/home");
    return { success: true as const };
  });
