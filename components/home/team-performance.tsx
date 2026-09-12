"use client";

import { useState } from "react";

import { FilterChip } from "@/components/home/filter-chip";
import { PlayerFormChart } from "@/components/home/player-form-chart";
import { PlayerMatchResults } from "@/components/home/player-match-results";
import { RoundRecap } from "@/components/home/round-recap";
import { Panel } from "@/components/layout/panel";
import { PlayerPhoto } from "@/components/player/player-photo";
import { Separator } from "@/components/ui/separator";
import type { RoundRecap as RoundRecapData } from "@/lib/home/types";
import {
  FORM_METRICS,
  metricLabel,
  seriesColor,
  type FormMetric,
  type RosterChartPlayer,
} from "@/lib/player/form";
import type { PlayerMatchPerformance } from "@/lib/player/types";
import { ROSTER_SIZE } from "@/lib/team/types";

export type TeamPerformanceProps = {
  recap: RoundRecapData | null;
  hasFinishedRound: boolean;
  performances: PlayerMatchPerformance[];
  /** Os seus 5, na ordem da escalação — define a cor de cada linha. */
  roster: readonly RosterChartPlayer[];
};

/**
 * "Desempenho do seu time": o que a rodada rendeu, como os seus 5 vêm jogando
 * e como terminaram os jogos deles.
 *
 * Era "O que aconteceu" e mostrava só o agregado — pontos, patrimônio,
 * colocação. Três números sobre um time não dizem **quem** jogou bem, que é a
 * pergunta que leva alguém a mexer na escalação. O painel manteve os números
 * (eles respondem "quanto") e ganhou o gráfico e os placares (que respondem
 * "quem" e "contra quem").
 *
 * Os dois filtros vivem no cabeçalho e não consultam nada: métrica troca o
 * eixo Y, jogador esconde as linhas dos outros.
 */
export function TeamPerformance({
  recap,
  hasFinishedRound,
  performances,
  roster,
}: TeamPerformanceProps) {
  const [metric, setMetric] = useState<FormMetric>("points");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const title = recap
    ? `Desempenho do seu time — Rodada ${recap.roundNumber}`
    : "Desempenho do seu time";

  // Só quem já jogou entra no filtro: um chip que sempre devolve nada não é
  // um filtro, é um beco.
  const played = new Set(performances.map((row) => row.playerId));
  const filterable = roster.filter((slot) => played.has(slot.playerId));

  return (
    <Panel
      title={title}
      actions={
        performances.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div
              role="group"
              aria-label="Escolher métrica"
              className="flex flex-wrap gap-1.5"
            >
              {FORM_METRICS.map((option) => (
                <FilterChip
                  key={option}
                  label={metricLabel(option)}
                  active={metric === option}
                  onSelect={() => setMetric(option)}
                />
              ))}
            </div>

            {filterable.length > 1 && (
              <div
                role="group"
                aria-label="Filtrar por jogador"
                className="flex flex-wrap gap-1.5"
              >
                <FilterChip
                  label="Todos"
                  active={selectedPlayerId === null}
                  onSelect={() => setSelectedPlayerId(null)}
                />
                {filterable.map((slot) => (
                  <FilterChip
                    key={slot.playerId}
                    label={slot.nickname}
                    leading={
                      <PlayerPhoto
                        photoUrl={slot.photoUrl}
                        nickname={slot.nickname}
                        size={20}
                        shape="circle"
                      />
                    }
                    accent={seriesColor(roster, slot.playerId)}
                    active={selectedPlayerId === slot.playerId}
                    onSelect={() => setSelectedPlayerId(slot.playerId)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      }
    >
      <RoundRecap recap={recap} hasFinishedRound={hasFinishedRound} />

      <Separator className="my-4" />
      <PlayerFormChart
        performances={performances}
        roster={roster}
        metric={metric}
        selectedPlayerId={selectedPlayerId}
      />

      <Separator className="my-4" />
      <PlayerMatchResults
        performances={performances}
        // O denominador é o elenco, não as vagas preenchidas: quem tem duas
        // vagas vazias continua tendo "5" como total.
        rosterSize={ROSTER_SIZE}
        selectedPlayerId={selectedPlayerId}
      />
    </Panel>
  );
}
