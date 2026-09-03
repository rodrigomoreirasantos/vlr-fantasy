"use client";

import { useState } from "react";

import { MatchSchedule } from "@/components/home/match-schedule";
import { Panel } from "@/components/layout/panel";
import type { UpcomingMatches as UpcomingMatchesData } from "@/lib/home/types";

export type UpcomingMatchesProps = {
  upcoming: UpcomingMatchesData;
  /** Injetável para o teste — o "agora" que define "Hoje" e a próxima partida. */
  now?: Date;
};

/**
 * O calendário real do circuito, alimentado pelo pipeline do vlr.gg: quando
 * cada jogo começa, agrupado por dia e filtrável por campeonato.
 *
 * A grade em si é `<MatchSchedule>`, compartilhada com "Sua rodada" — lá o
 * mesmo layout mostra o fechamento do mercado no lugar do kickoff.
 */
export function UpcomingMatches({
  upcoming,
  now = new Date(),
}: UpcomingMatchesProps) {
  const { matches, myOrganizations } = upcoming;
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

  return (
    <Panel title="Próximos jogos">
      <MatchSchedule
        matches={matches}
        myOrganizations={myOrganizations}
        selectedEvent={selectedEvent}
        onSelectEvent={setSelectedEvent}
        now={now}
      />
    </Panel>
  );
}
