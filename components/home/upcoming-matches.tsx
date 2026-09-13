"use client";

import { useState } from "react";

import { MarketCountdown } from "@/components/market/market-countdown";
import { MatchSchedule } from "@/components/home/match-schedule";
import { Panel } from "@/components/layout/panel";
import { useTimezone } from "@/components/layout/timezone";
import type { UpcomingMatches as UpcomingMatchesData } from "@/lib/home/types";
import {
  formatMarketClose,
  marketClosesByMatch,
  nextMarketClose,
} from "@/lib/market/window";
import { formatTimezoneOffset } from "@/lib/round/format";
import type { EventRegion } from "@/lib/round/regions";
import { matchesInRegion, regionLabel } from "@/lib/round/regions";

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
 * mercado lado a lado.
 *
 * **E o relógio do topo só existe com uma região escolhida.** O mercado fecha
 * por campeonato e por dia (`marketClosesByMatch`); um único relógio sobre o
 * circuito inteiro anunciava o próximo fechamento de qualquer liga — um
 * horário que quase nunca era o do usuário, e que fazia parecer que o mercado
 * dele ia trancar de madrugada por causa de um jogo de Pacific.
 */
export function UpcomingMatches({
  upcoming,
  now = new Date(),
}: UpcomingMatchesProps) {
  const { matches, myOrganizations } = upcoming;
  const [selectedRegion, setSelectedRegion] = useState<EventRegion | null>(
    null,
  );
  const tz = useTimezone();

  if (matches.length === 0) {
    return (
      <Panel title="Próximos jogos" tourId="proximos-jogos">
        <p className="text-sm text-muted-foreground">
          Nenhum jogo confirmado no circuito agora.
        </p>
      </Panel>
    );
  }

  const closesAt = selectedRegion
    ? nextMarketClose(matchesInRegion(matches, selectedRegion), now)
    : null;

  return (
    <Panel title="Próximos jogos" tourId="proximos-jogos">
      {/* Sem isso, um horário certo é indistinguível de um errado: o usuário
          não tem como saber que a tela já se adaptou ao fuso dele. */}
      <p className="mb-3 text-[10px] text-muted-foreground">
        Horários em GMT{formatTimezoneOffset(tz, now)} (seu fuso)
      </p>

      {selectedRegion === null ? (
        <p className="text-sm text-muted-foreground">
          O mercado fecha por campeonato, uma hora antes do primeiro jogo do
          dia. Escolha uma região para ver quando o dela fecha.
        </p>
      ) : closesAt ? (
        <MarketCountdown
          // Remonta ao trocar de região: o countdown guarda a frase inicial no
          // primeiro estado e só a recalcula no tick seguinte — sem a `key`, a
          // troca ficaria meio minuto mostrando a hora anterior.
          key={selectedRegion}
          closesAt={closesAt}
          initialCountdown={formatMarketClose(closesAt, now)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Mercado aberto — nenhum jogo de {regionLabel(selectedRegion)} marcado
          para fechá-lo.
        </p>
      )}

      <div className="mt-4">
        <MatchSchedule
          matches={matches}
          myOrganizations={myOrganizations}
          selectedRegion={selectedRegion}
          onSelectRegion={setSelectedRegion}
          closesBy={marketClosesByMatch(matches)}
          now={now}
        />
      </div>
    </Panel>
  );
}
