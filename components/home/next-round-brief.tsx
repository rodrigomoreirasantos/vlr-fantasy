"use client";

import { useState } from "react";

import { MarketCountdown } from "@/components/home/market-countdown";
import { MatchSchedule } from "@/components/home/match-schedule";
import { Panel } from "@/components/layout/panel";
import type { NextRoundBrief as NextRoundBriefData } from "@/lib/home/types";
import { nextMarketClose } from "@/lib/home/summary";
import { formatMarketCountdown, marketClosesAtFor } from "@/lib/market/window";
import type { RoundMatch } from "@/lib/round/types";

export type NextRoundBriefProps = {
  nextRound: NextRoundBriefData | null;
  /** Injetável para o teste — o "agora" que decide o próximo fechamento. */
  now?: Date;
};

/** O relógio desta lista é o do mercado: uma hora antes de cada jogo começar. */
const marketTimeOf = (match: RoundMatch) =>
  marketClosesAtFor(match.scheduledAt);

/**
 * "Sua rodada": quando o mercado fecha, jogo a jogo.
 *
 * É a mesma grade de "Próximos jogos" — mesmo filtro por campeonato, mesmo
 * agrupamento por dia — com o relógio trocado: cada linha mostra a hora em que
 * o mercado daquele jogo fecha, uma hora antes do kickoff. O countdown do topo
 * segue o filtro, e quando o campeonato escolhido não é o que fecha primeiro,
 * o painel diz qual é: quem tranca a escalação é sempre o mais cedo.
 *
 * A lista vem do pipeline do vlr.gg, como o calendário: só partida de
 * campeonato seguido entra (`listUpcomingRoundMatches`).
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

  const filtered = selectedEvent
    ? matches.filter((match) => match.event === selectedEvent)
    : matches;

  // Sem filtro, a frase é a que o servidor formatou — primeiro paint e
  // hidratação idênticos. Com filtro, o cliente recalcula pela mesma função.
  const closesAt = selectedEvent
    ? (nextMarketClose(filtered, now) ?? marketClosesAt)
    : marketClosesAt;
  const countdown = selectedEvent
    ? formatMarketCountdown({ opensAt: marketOpensAt, closesAt }, now)
    : marketCountdown;

  const bindingClosesAt = nextMarketClose(matches, now);
  const locksEarlier =
    bindingClosesAt !== null && bindingClosesAt.getTime() < closesAt.getTime();

  return (
    <Panel title={`Sua rodada ${roundNumber}`}>
      <MarketCountdown
        // Remonta ao trocar de campeonato: o countdown guarda a frase inicial
        // no primeiro estado e só a recalcula no tick seguinte — sem a `key`,
        // a troca ficaria meio minuto mostrando a hora anterior.
        key={selectedEvent ?? "all"}
        opensAt={marketOpensAt}
        closesAt={closesAt}
        initialCountdown={countdown}
      />

      {locksEarlier && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Sua escalação, porém, tranca antes: o mercado da rodada fecha com o
          primeiro jogo dela.
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
