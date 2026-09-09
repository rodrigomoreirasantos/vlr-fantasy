"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import {
  MarketSheet,
  type MarketSelection,
} from "@/components/market/market-sheet";
import { FormationBoard } from "@/components/team/formation-board";
import { LineupProgress } from "@/components/team/lineup-progress";
import { Panel } from "@/components/layout/panel";
import { EmptyPlayerRow, PlayerRow } from "@/components/team/player-row";
import {
  loadMarket,
  sellPlayer,
  setCaptain,
  substitutePlayer,
} from "@/app/(app)/my-team/actions";
import { isTeamLocked } from "@/lib/market/lock";
import type { MarketData, Player, RosterSlot } from "@/lib/team/types";

export type RosterPanelProps = {
  roster: RosterSlot[];
  balanceCents: number;
  marketOpen: boolean;
  /** Organizações cujo mercado fechou hoje (`lockedOrganizations`). */
  lockedTeams: readonly string[];
  closesIn: string;
  /** O instante de fechamento, recortado pela região do time — `summary.market.closesAt`. */
  closesAt: Date | null;
};

/**
 * Ilha cliente que reúne "Resumo" e "Time Montado": é dona do estado de
 * seleção (qual vaga abriu o mercado) e do disparo da Server Action de
 * substituição. Clicar numa vaga — ocupada ou vazia, na lista ou no campo —
 * seleciona a mesma vaga e abre o mesmo `MarketSheet`; vaga vazia entra em
 * modo "nova contratação" (`outgoingPlayerId: null`), vaga ocupada em modo
 * substituição.
 *
 * O catálogo do mercado nunca chega por prop: a página não o carrega mais
 * (`prompts/11_maket_players.md` — o modal sempre com o scrap mais
 * atualizado). Selecionar uma vaga dispara `loadMarket`, que relê tudo —
 * catálogo, saldo, trava do dia e fechamento — no instante do clique; até a
 * resposta voltar, o `MarketSheet` mostra o resto normalmente (com o dado da
 * página) e só a lista de candidatos fica em skeleton.
 */
export function RosterPanel({
  roster,
  balanceCents,
  marketOpen,
  lockedTeams,
  closesIn,
  closesAt,
}: RosterPanelProps) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Nunca reaproveitado entre vagas: toda seleção nova zera este estado antes
  // de disparar `loadMarket` de novo (ver `handleSelect`).
  const [marketData, setMarketData] = useState<MarketData | null>(null);

  const rosteredPlayerIds = useMemo(
    () => roster.flatMap((slot) => (slot.player ? [slot.player.id] : [])),
    [roster],
  );
  const filledCount = rosteredPlayerIds.length;

  const selectedSlot =
    selectedIndex !== null ? (roster[selectedIndex] ?? null) : null;
  const outgoing = selectedSlot?.player ?? null;
  const selection: MarketSelection | null =
    selectedIndex !== null && selectedSlot?.id
      ? { position: selectedIndex + 1, outgoing }
      : null;

  const { execute, isExecuting } = useAction(substitutePlayer, {
    onSuccess: () => {
      toast.success("Time atualizado!");
      setSelectedIndex(null);
      setMarketData(null);
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível concluir a operação.");
    },
  });

  const { execute: executeSetCaptain } = useAction(setCaptain, {
    onSuccess: () => {
      toast.success("Capitão atualizado!");
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível atualizar o capitão.");
    },
  });

  const { execute: executeSell, isExecuting: isSelling } = useAction(
    sellPlayer,
    {
      onSuccess: () => {
        toast.success("Jogador vendido!");
        setSelectedIndex(null);
        setMarketData(null);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Não foi possível vender o jogador.");
      },
    },
  );

  const { execute: executeLoadMarket } = useAction(loadMarket, {
    onSuccess: ({ data }) => {
      if (data) setMarketData(data);
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível carregar o mercado.");
      setSelectedIndex(null);
    },
  });

  /**
   * A vaga é negociável agora? Vaga vazia sempre é — não há jogador travado
   * nela, e o mercado de quem entra é conferido em `evaluateSubstitution`.
   */
  function slotIsOpen(index: number): boolean {
    const slot = roster[index];
    if (!marketOpen || !slot?.id) return false;
    return !slot.player || !isTeamLocked(lockedTeams, slot.player.team);
  }

  function handleSelect(index: number) {
    if (!slotIsOpen(index)) return;
    setSelectedIndex(index);
    // Zera antes de buscar de novo: reabrir uma vaga (mesma ou outra) nunca
    // reaproveita o catálogo da seleção anterior.
    setMarketData(null);
    const slot = roster[index];
    if (slot?.id) executeLoadMarket({ slotId: slot.id });
    // Mantém "Resumo"/"Time Montado" em dia — o catálogo em si só viaja pela
    // action acima, nunca de novo pelo HTML da página.
    router.refresh();
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSelectedIndex(null);
      setMarketData(null);
    }
  }

  function handleConfirm(candidate: Player) {
    if (!selectedSlot?.id) return;
    execute({
      slotId: selectedSlot.id,
      outgoingPlayerId: outgoing?.id ?? null,
      incomingPlayerId: candidate.id,
    });
  }

  function handleSetCaptain(index: number) {
    const slot = roster[index];
    if (!slot?.id || slot.captain) return;
    executeSetCaptain({ slotId: slot.id });
  }

  function handleSell(playerToSell: Player) {
    if (!selectedSlot?.id) return;
    executeSell({ slotId: selectedSlot.id, outgoingPlayerId: playerToSell.id });
  }

  // Venda direto na linha do Resumo, sem passar pelo Sheet — mesma action,
  // só que disparada pelo índice da vaga em vez de pela seleção corrente.
  function handleSellAt(index: number) {
    const slot = roster[index];
    if (!slot?.id || !slot.player) return;
    executeSell({ slotId: slot.id, outgoingPlayerId: slot.player.id });
  }

  /**
   * Ternário, e não `??` como os vizinhos: `closesAt: null` é resposta
   * **válida** de `loadMarket` ("nenhum jogo marcado"), e o `??` cairia de
   * volta no valor da página — o resumo mostraria "Nenhum jogo marcado" e,
   * 30s depois, tickaria uma contagem para um fechamento que o servidor já
   * não reconhece. Saldo, trava e frase podem usar `??`: nenhum deles tem
   * `null`/`undefined` como valor legítimo.
   */
  const sheetClosesAt = marketData ? marketData.closesAt : closesAt;

  return (
    <>
      {filledCount < roster.length && (
        <LineupProgress filled={filledCount} total={roster.length} />
      )}

      <div className="mb-6 grid items-start gap-6 lg:grid-cols-[420px_1fr]">
        <Panel title="Resumo">
          <ul className="flex flex-col gap-2">
            {roster.map((slot, index) =>
              slot.player ? (
                <PlayerRow
                  key={slot.player.id}
                  player={slot.player}
                  captain={slot.captain}
                  warning={slot.warning}
                  selected={index === selectedIndex}
                  onSelect={
                    slotIsOpen(index) ? () => handleSelect(index) : undefined
                  }
                  onSetCaptain={
                    slotIsOpen(index)
                      ? () => handleSetCaptain(index)
                      : undefined
                  }
                  onSell={
                    slotIsOpen(index) ? () => handleSellAt(index) : undefined
                  }
                />
              ) : (
                <EmptyPlayerRow
                  key={`slot-${index}`}
                  position={index + 1}
                  selected={index === selectedIndex}
                  onSelect={
                    slotIsOpen(index) ? () => handleSelect(index) : undefined
                  }
                />
              ),
            )}
          </ul>
        </Panel>

        <Panel title="Time Montado">
          <FormationBoard
            roster={roster}
            // `handleSelect` já recusa a vaga travada; passar a função
            // sempre mantém o tabuleiro clicável para as outras.
            onSelect={marketOpen ? handleSelect : undefined}
            selectedIndex={selectedIndex}
            onSetCaptain={marketOpen ? handleSetCaptain : undefined}
          />
        </Panel>
      </div>

      <MarketSheet
        open={selection !== null}
        onOpenChange={handleOpenChange}
        selection={selection}
        market={marketData?.market ?? null}
        scope={marketData?.scope ?? null}
        balanceCents={marketData?.balanceCents ?? balanceCents}
        marketOpen={marketData?.marketOpen ?? marketOpen}
        lockedTeams={marketData?.lockedTeams ?? lockedTeams}
        closesIn={marketData?.closesIn ?? closesIn}
        closesAt={sheetClosesAt}
        rosteredPlayerIds={rosteredPlayerIds}
        onConfirm={handleConfirm}
        onSell={handleSell}
        pending={isExecuting || isSelling}
      />
    </>
  );
}
