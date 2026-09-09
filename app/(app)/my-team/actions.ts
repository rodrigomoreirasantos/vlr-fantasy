"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  evaluateSale,
  evaluateSubstitution,
  blockReasonMessage,
} from "@/lib/market/eligibility";
import { isTeamLocked, lockedOrganizations } from "@/lib/market/lock";
import { scopeOrganizations } from "@/lib/market/scope";
import {
  formatTimeLeft,
  marketMatchesFor,
  nextMarketClose,
} from "@/lib/market/window";
import { listMarketLockMatches } from "@/lib/round/queries";
import { toTeamRegion } from "@/lib/round/regions";
import { ActionError, authActionClient } from "@/lib/safe-action";
import { toDomainPlayer } from "@/lib/team/mappers";
import {
  applySale,
  applySubstitution,
  getActiveRound,
  getMarketByRole,
  hasCaptain,
  loadPlayersByIds,
  loadRosteredPlayerIds,
  lockSlotForUpdate,
  lockTeamForSlot,
  resolveMarketScope,
  setTeamCaptain,
} from "@/lib/team/queries";
import { PLAYER_ROLES, type MarketData } from "@/lib/team/types";
import {
  loadMarketSchema,
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
      // substituição concorrente do mesmo usuário. A região do time sai do
      // banco, nunca do cliente — `lockTeamForSlot` já garante que `slotId`
      // pertence a um dos 5 times do usuário.
      const team = await lockTeamForSlot(tx, ctx.userId, slotId);
      if (!team) {
        throw new ActionError("Não encontramos seu time. Recarregue a página.");
      }

      const activeRound = await getActiveRound(tx);
      // A trava é a regra do dia, relida do banco dentro da transação: o
      // cliente pode ter carregado a página antes de o mercado fechar.
      const marketOpen = activeRound !== null;
      const lockedTeams = lockedOrganizations(
        await listMarketLockMatches(new Date(), tx),
      );
      // `tx` explícito: `resolveMarketScope` sem querier usa o client global
      // e tiraria uma segunda conexão do pool com esta transação aberta.
      const scope = await resolveMarketScope(toTeamRegion(team.region), tx);

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
          lockedTeams,
          balanceCents: team.balanceCents,
          outgoing: outgoing ? toDomainPlayer(outgoing) : null,
          rosteredPlayerIds,
          scope,
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
      const team = await lockTeamForSlot(tx, ctx.userId, slotId);
      if (!team) {
        throw new ActionError("Não encontramos seu time. Recarregue a página.");
      }

      const activeRound = await getActiveRound(tx);
      const marketOpen = activeRound !== null;
      const lockedTeams = lockedOrganizations(
        await listMarketLockMatches(new Date(), tx),
      );

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
        { marketOpen, lockedTeams, balanceCents: team.balanceCents },
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
 * mesma trava da substituição: o campeonato do jogador que recebe a
 * braçadeira não pode ter fechado hoje. Dobrar a pontuação de quem já está
 * entrando em quadra é a mesma jogada que trocá-lo — só que de graça.
 */
export const setCaptain = authActionClient
  .inputSchema(setCaptainSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { slotId } = parsedInput;

    await db.transaction(async (tx) => {
      const team = await lockTeamForSlot(tx, ctx.userId, slotId);
      if (!team) {
        throw new ActionError("Não encontramos seu time. Recarregue a página.");
      }

      const activeRound = await getActiveRound(tx);
      if (!activeRound) {
        throw new ActionError("Não há rodada ativa no momento.");
      }

      const slot = await lockSlotForUpdate(tx, team.id, slotId);
      if (!slot || !slot.playerId) {
        throw new ActionError("Essa vaga não tem jogador para ser capitão.");
      }
      if (slot.captain) return;

      const [captain] = await loadPlayersByIds(tx, [slot.playerId]);
      const lockedTeams = lockedOrganizations(
        await listMarketLockMatches(new Date(), tx),
      );
      if (captain && isTeamLocked(lockedTeams, captain.team)) {
        throw new ActionError(blockReasonMessage("market-closed"));
      }

      await setTeamCaptain(tx, team.id, slotId);
    });

    revalidatePath("/my-team");
    // A Home mostra a escalação (alertas dos seus 5) e o patrimônio.
    revalidatePath("/home");
    return { success: true as const };
  });

/**
 * O mercado, o saldo, a trava do dia e o fechamento — tudo relido do banco no
 * instante em que o usuário abre uma vaga (`prompts/11_maket_players.md`: o
 * modal **sempre** com o scrap mais atualizado). A página nunca carrega o
 * catálogo inteiro no HTML — só quando esta action é chamada, ao clicar.
 *
 * Só leitura: sem `db.transaction` nem lock retido. `lockTeamForSlot` é
 * reaproveitada pelo `WHERE` (o time dono da vaga), não pela trava em si —
 * `SELECT … FOR UPDATE` fora de uma transação libera o lock ao final da
 * própria consulta.
 */
export const loadMarket = authActionClient
  .inputSchema(loadMarketSchema)
  // Tipo de retorno explícito: `MarketData` (lib/team/types.ts) é o que o
  // `RosterPanel` guarda em estado, e anotá-lo aqui é o que impede os dois
  // de divergirem em silêncio.
  .action(async ({ parsedInput, ctx }): Promise<MarketData> => {
    const { slotId } = parsedInput;

    const team = await lockTeamForSlot(db, ctx.userId, slotId);
    if (!team) {
      throw new ActionError("Não encontramos seu time. Recarregue a página.");
    }

    // A região sai do banco (o time dono da vaga), nunca do cliente — mesma
    // regra de `substitutePlayer`.
    const region = toTeamRegion(team.region);

    const [round, lockMatches, scope] = await Promise.all([
      getActiveRound(),
      listMarketLockMatches(),
      resolveMarketScope(region),
    ]);
    // `?? null` como em `loadTeamOverview`: `getActiveRound` devolve
    // `undefined` quando não há rodada (`findFirst` do Drizzle), e
    // `undefined !== null` seria `true` — o mercado apareceria aberto
    // justamente quando não há rodada nenhuma para registrar a transferência.
    const activeRound = round ?? null;
    const marketOpen = activeRound !== null;
    const lockedTeams = lockedOrganizations(lockMatches);
    const market = await getMarketByRole(PLAYER_ROLES, scope);
    // Recortado pelo time — o mesmo fechamento que `MarketSummaryBar` já
    // mostra na página, relido no instante do clique.
    const closesAt = nextMarketClose(
      marketMatchesFor(lockMatches, region, scopeOrganizations(scope)),
    );

    return {
      market,
      scope,
      balanceCents: team.balanceCents,
      marketOpen,
      lockedTeams,
      closesAt,
      closesIn: closesAt
        ? formatTimeLeft(closesAt)
        : marketOpen
          ? "Nenhum jogo marcado"
          : "Nenhuma rodada ativa",
    };
  });
