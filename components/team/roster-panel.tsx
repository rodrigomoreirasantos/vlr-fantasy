"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import {
  MarketSheet,
  type MarketSelection,
} from "@/components/market/market-sheet";
import { FormationBoard } from "@/components/team/formation-board";
import { LineupProgress } from "@/components/team/lineup-progress";
import { Panel } from "@/components/team/panel";
import { EmptyPlayerRow, PlayerRow } from "@/components/team/player-row";
import { setCaptain, substitutePlayer } from "@/app/my-team/actions";
import type { Player, PlayerRole, RosterSlot } from "@/lib/team/types";

export type RosterPanelProps = {
  roster: RosterSlot[];
  market: Record<PlayerRole, Player[]>;
  balanceCents: number;
  marketOpen: boolean;
  closesIn: string;
};

/**
 * Ilha cliente que reúne "Resumo" e "Time Montado": é dona do estado de
 * seleção (qual vaga abriu o mercado) e do disparo da Server Action de
 * substituição. Clicar numa vaga — ocupada ou vazia, na lista ou no campo —
 * seleciona a mesma vaga e abre o mesmo `MarketSheet`; vaga vazia entra em
 * modo "nova contratação" (`outgoingPlayerId: null`), vaga ocupada em modo
 * substituição.
 */
export function RosterPanel({
  roster,
  market,
  balanceCents,
  marketOpen,
  closesIn,
}: RosterPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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

  function handleSelect(index: number) {
    if (!marketOpen || !roster[index]?.id) return;
    setSelectedIndex(index);
  }

  function handleOpenChange(open: boolean) {
    if (!open) setSelectedIndex(null);
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
                  selected={index === selectedIndex}
                  onSelect={
                    marketOpen && slot.id
                      ? () => handleSelect(index)
                      : undefined
                  }
                  onSetCaptain={
                    marketOpen && slot.id
                      ? () => handleSetCaptain(index)
                      : undefined
                  }
                />
              ) : (
                <EmptyPlayerRow
                  key={`slot-${index}`}
                  position={index + 1}
                  selected={index === selectedIndex}
                  onSelect={
                    marketOpen && slot.id
                      ? () => handleSelect(index)
                      : undefined
                  }
                />
              ),
            )}
          </ul>
        </Panel>

        <Panel title="Time Montado">
          <FormationBoard
            roster={roster}
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
        market={market}
        balanceCents={balanceCents}
        marketOpen={marketOpen}
        closesIn={closesIn}
        rosteredPlayerIds={rosteredPlayerIds}
        onConfirm={handleConfirm}
        pending={isExecuting}
      />
    </>
  );
}
