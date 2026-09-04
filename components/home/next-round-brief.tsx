"use client";

import { useState } from "react";

import { MarketCountdown } from "@/components/home/market-countdown";
import { MatchSchedule } from "@/components/home/match-schedule";
import { Panel } from "@/components/layout/panel";
import type { NextRoundBrief as NextRoundBriefData } from "@/lib/home/types";
import {
  formatMarketCountdown,
  marketClosesByMatch,
  nextMarketClose,
} from "@/lib/market/window";

export type NextRoundBriefProps = {
  nextRound: NextRoundBriefData | null;
  /** Injetável para o teste — o "agora" que decide o próximo fechamento. */
  now?: Date;
};

/**
 * "Sua rodada": quando o mercado fecha, jogo a jogo.
 *
 * É a mesma grade de "Próximos jogos" — mesma lista, mesmo filtro por
 * campeonato, mesmo agrupamento por dia — com o relógio trocado: cada linha
 * mostra a hora em que o mercado daquele campeonato fecha naquele dia, uma
 * hora antes do primeiro jogo dele (`marketClosesByMatch`). Jogos do mesmo
 * campeonato no mesmo dia repetem o horário porque é isso que a regra diz: o
 * mercado fecha uma vez por dia, não a cada partida.
 *
 * O countdown do topo segue o filtro — cada campeonato tranca no seu horário,
 * e um dia de Pacific de madrugada não fecha o mercado de quem só tem jogador
 * de Americas.
 */
export function NextRoundBrief({
  nextRound,
  now = new Date(),
}: NextRoundBriefProps) {
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
    matches,
    myOrganizations,
  } = nextRound;

  const closes = marketClosesByMatch(matches);
  /** O relógio desta lista: o fechamento do campeonato naquele dia. */
  const marketTimeOf = (match: (typeof matches)[number]) =>
    closes.get(match.id) ?? match.scheduledAt;

  const filtered = selectedEvent
    ? matches.filter((match) => match.event === selectedEvent)
    : matches;

  // Sem filtro, a frase é a que o servidor formatou — primeiro paint e
  // hidratação idênticos. Com filtro, o cliente recalcula pela mesma função.
  const closesAt = selectedEvent
    ? nextMarketClose(filtered, now)
    : marketClosesAt;
  const countdown = selectedEvent
    ? closesAt &&
      formatMarketCountdown({ opensAt: marketOpensAt, closesAt }, now)
    : marketCountdown;

  return (
    <Panel title={`Sua rodada ${roundNumber}`}>
      {closesAt && countdown ? (
        <MarketCountdown
          // Remonta ao trocar de campeonato: o countdown guarda a frase inicial
          // no primeiro estado e só a recalcula no tick seguinte — sem a `key`,
          // a troca ficaria meio minuto mostrando a hora anterior.
          key={selectedEvent ?? "all"}
          opensAt={marketOpensAt}
          closesAt={closesAt}
          initialCountdown={countdown}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Mercado aberto — nenhum jogo marcado para fechá-lo.
        </p>
      )}

      {matches.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Nenhum jogo marcado para esta rodada ainda.
        </p>
      ) : (
        <div className="mt-4">
          <MatchSchedule
            matches={matches}
            myOrganizations={myOrganizations}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            timeOf={marketTimeOf}
            now={now}
          />
        </div>
      )}
    </Panel>
  );
}
