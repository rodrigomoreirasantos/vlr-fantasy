"use client";

import { useState } from "react";

import { MarketCountdown } from "@/components/home/market-countdown";
import { Panel } from "@/components/layout/panel";
import type {
  NextRoundBrief as NextRoundBriefData,
  RoundMarketWindow,
} from "@/lib/home/types";
import { formatMatchKickoff } from "@/lib/round/format";
import { cn } from "@/lib/utils";

export type NextRoundBriefProps = {
  nextRound: NextRoundBriefData | null;
};

/**
 * "Sua rodada": quando o mercado fecha. Nada mais.
 *
 * Cada campeonato fecha uma hora antes do seu primeiro jogo, e o filtro deixa
 * ver qualquer um deles — mas quem tranca a escalação é o que fecha primeiro,
 * e é por ele que o painel abre. É também por isso que a lista vai do mais
 * cedo para o mais tarde, e não por relevância de torneio: aqui o que urge é
 * o relógio, não o tamanho do campeonato.
 *
 * O que **não** está aqui é tão deliberado quanto o que está. Alerta de
 * jogador que não vai jogar saiu: no Valorant competitivo não existe boletim
 * de lesão nem escalação divulgada com antecedência, e um aviso que a fonte
 * não sabe dar é um aviso que a tela inventa.
 */
export function NextRoundBrief({ nextRound }: NextRoundBriefProps) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  if (!nextRound) {
    return (
      <Panel title="Sua rodada">
        <p className="text-sm text-muted-foreground">
          Nenhuma rodada agendada no momento.
        </p>
      </Panel>
    );
  }

  const {
    roundNumber,
    marketOpensAt,
    marketClosesAt,
    marketCountdown,
    windows,
  } = nextRound;

  // Sem partida marcada, resta a janela da própria rodada — que é o que o
  // banco tem, e é melhor do que um painel mudo.
  if (windows.length === 0) {
    return (
      <Panel title={`Sua rodada ${roundNumber}`}>
        <MarketCountdown
          opensAt={marketOpensAt}
          closesAt={marketClosesAt}
          initialCountdown={marketCountdown}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Nenhum jogo marcado para esta rodada ainda.
        </p>
      </Panel>
    );
  }

  const binding = windows.find((window) => window.binding) ?? windows[0];
  const selected =
    windows.find((window) => window.event === selectedEvent) ?? binding;

  return (
    <Panel title={`Sua rodada ${roundNumber}`}>
      <MarketCountdown
        // Remonta ao trocar de campeonato: o countdown guarda a frase do
        // servidor no primeiro estado e só a recalcula no tick seguinte —
        // sem a `key`, a troca ficaria meio minuto mostrando a hora anterior.
        key={selected.event}
        opensAt={marketOpensAt}
        closesAt={selected.closesAt}
        initialCountdown={selected.countdown}
      />

      <p className="mt-1.5 text-xs text-muted-foreground">
        Fecha 1h antes de{" "}
        <span className="font-bold text-foreground">
          {selected.firstMatch.teamA} × {selected.firstMatch.teamB}
        </span>
        , {formatMatchKickoff(selected.firstMatch.scheduledAt)}.
      </p>

      {!selected.binding && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Sua escalação, porém, tranca antes: {binding.label} fecha em{" "}
          {formatMatchKickoff(binding.closesAt)}.
        </p>
      )}

      {windows.length > 1 && (
        <div
          role="group"
          aria-label="Fechamento por campeonato"
          className="mt-4 flex flex-wrap gap-1.5"
        >
          {windows.map((window) => (
            <MarketWindowChip
              key={window.event}
              window={window}
              active={window.event === selected.event}
              onSelect={() => setSelectedEvent(window.event)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

type MarketWindowChipProps = {
  window: RoundMarketWindow;
  active: boolean;
  onSelect: () => void;
};

/** Um campeonato e a hora em que o mercado dele fecha. */
function MarketWindowChip({ window, active, onSelect }: MarketWindowChipProps) {
  return (
    <button
      type="button"
      title={window.event}
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "clip-corner flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.12em] uppercase ring-1 transition-colors [--clip:6px]",
        active
          ? "bg-primary text-primary-foreground ring-primary"
          : "bg-secondary text-muted-foreground ring-border hover:text-foreground",
      )}
    >
      {window.label}
      {/* O selo do que tranca a escalação: é o único que muda o que o
          usuário pode fazer agora. */}
      {window.binding && <span aria-label="fecha primeiro">•</span>}
    </button>
  );
}
