"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { MarketSheet } from "@/components/market/market-sheet";
import { FormationBoard } from "@/components/team/formation-board";
import { Panel } from "@/components/team/panel";
import { EmptyPlayerRow, PlayerRow } from "@/components/team/player-row";
import { substitutePlayer } from "@/app/my-team/actions";
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
 * substituição. Clicar num jogador — na lista ou no campo — seleciona a
 * mesma vaga e abre o mesmo `MarketSheet`.
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

  const selectedSlot = selectedIndex !== null ? (roster[selectedIndex] ?? null) : null;
  const outgoing = selectedSlot?.player ?? null;

  const { execute, isExecuting } = useAction(substitutePlayer, {
    onSuccess: () => {
      toast.success("Substituição concluída!");
      setSelectedIndex(null);
    },
    onError: ({ error }) => {
      toast.error(
        error.serverError ?? "Não foi possível concluir a substituição.",
      );
    },
  });

  function handleSelect(index: number) {
    if (!marketOpen) return;
    setSelectedIndex(index);
  }

  function handleOpenChange(open: boolean) {
    if (!open) setSelectedIndex(null);
  }

  function handleConfirm(candidate: Player) {
    if (!selectedSlot?.id || !outgoing) return;
    execute({
      slotId: selectedSlot.id,
      outgoingPlayerId: outgoing.id,
      incomingPlayerId: candidate.id,
    });
  }

  return (
    <>
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
                    marketOpen && slot.id ? () => handleSelect(index) : undefined
                  }
                />
              ) : (
                <EmptyPlayerRow key={`slot-${index}`} position={index + 1} />
              ),
            )}
          </ul>
        </Panel>

        <Panel title="Time Montado">
          <FormationBoard
            roster={roster}
            onSelect={marketOpen ? handleSelect : undefined}
            selectedIndex={selectedIndex}
          />
        </Panel>
      </div>

      <MarketSheet
        open={selectedSlot !== null}
        onOpenChange={handleOpenChange}
        outgoing={outgoing}
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
