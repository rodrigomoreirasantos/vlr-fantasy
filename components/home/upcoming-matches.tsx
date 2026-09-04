"use client";

import { useState } from "react";

import { MarketCountdown } from "@/components/home/market-countdown";
import { MatchSchedule } from "@/components/home/match-schedule";
import { Panel } from "@/components/layout/panel";
import type { UpcomingMatches as UpcomingMatchesData } from "@/lib/home/types";
import {
  formatMarketClose,
  marketClosesByMatch,
  nextMarketClose,
} from "@/lib/market/window";

export type UpcomingMatchesProps = {
  upcoming: UpcomingMatchesData;
  /** Injetável para o teste — o "agora" que define "Hoje" e a próxima partida. */
  now?: Date;
};

/**
 * O calendário do circuito e o mercado, num painel só.
 *
 * Eram dois — "Sua rodada" e "Próximos jogos" — e mostravam as mesmas
 * partidas com relógios diferentes, o que obrigava o usuário a cruzar duas
 * listas idênticas para responder uma pergunta só: até quando dá para mexer no
 * time antes deste jogo. Agora cada linha traz o kickoff e o fechamento do
 * mercado lado a lado, e o countdown do topo segue o filtro de campeonato —
 * porque a regra é por campeonato e por dia (`marketClosesByMatch`), e um dia
 * de Pacific de madrugada não tranca quem só tem jogador de Americas.
 */
export function UpcomingMatches({
  upcoming,
  now = new Date(),
}: UpcomingMatchesProps) {
  const { matches, myOrganizations, marketClosesAt, marketCountdown } =
    upcoming;
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  if (matches.length === 0) {
    return (
      <Panel title="Próximos jogos">
        <p className="text-sm text-muted-foreground">
          Nenhum jogo confirmado no circuito agora.
        </p>
      </Panel>
    );
  }

  const filtered = selectedEvent
    ? matches.filter((match) => match.event === selectedEvent)
    : matches;

  // Sem filtro, a frase é a que o servidor formatou — primeiro paint e
  // hidratação idênticos. Com filtro, o cliente recalcula pela mesma função.
  const closesAt = selectedEvent
    ? nextMarketClose(filtered, now)
    : marketClosesAt;
  const countdown = selectedEvent
    ? closesAt && formatMarketClose(closesAt, now)
    : marketCountdown;

  return (
    <Panel title="Próximos jogos">
      {closesAt && countdown ? (
        <MarketCountdown
          // Remonta ao trocar de campeonato: o countdown guarda a frase inicial
          // no primeiro estado e só a recalcula no tick seguinte — sem a `key`,
          // a troca ficaria meio minuto mostrando a hora anterior.
          key={selectedEvent ?? "all"}
          closesAt={closesAt}
          initialCountdown={countdown}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Mercado aberto — nenhum jogo marcado para fechá-lo.
        </p>
      )}

      <div className="mt-4">
        <MatchSchedule
          matches={matches}
          myOrganizations={myOrganizations}
          selectedEvent={selectedEvent}
          onSelectEvent={setSelectedEvent}
          closesBy={marketClosesByMatch(matches)}
          now={now}
        />
      </div>
    </Panel>
  );
}
