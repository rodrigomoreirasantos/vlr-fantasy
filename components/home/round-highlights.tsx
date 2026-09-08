"use client";

import { useMemo, useState } from "react";

import { FilterChip } from "@/components/home/filter-chip";
import { PriceMoverList } from "@/components/home/price-mover-list";
import { Panel } from "@/components/layout/panel";
import { ScorerHighlight } from "@/components/team/scorer-highlight";
import { highlightsFor, PRICE_MOVER_LIMIT } from "@/lib/home/summary";
import type { RoundHighlights as RoundHighlightsData } from "@/lib/home/types";
import type { EventRegion } from "@/lib/round/regions";
import { regionColor, regionLabel, sortRegions } from "@/lib/round/regions";

export type RoundHighlightsProps = {
  highlights: RoundHighlightsData | null;
};

/**
 * Destaques do jogo inteiro: maior pontuador, altas e quedas.
 *
 * **Sem número de rodada no título.** A rodada do fantasy é uma semana do
 * circuito, e o número dela não ajuda ninguém a interpretar quem pontuou —
 * atrapalhava, aliás, quando os destaques vinham da rodada em andamento e o
 * número não batia com o "Rodada N" do painel de cima.
 *
 * **E cada região só aparece depois que ela termina de jogar no dia.** Enquanto
 * a liga ainda tem jogo hoje, anunciar o maior pontuador é entregar o resultado
 * de uma partida em andamento para quem ainda vai assisti-la.
 */
export function RoundHighlights({ highlights }: RoundHighlightsProps) {
  const [selectedRegion, setSelectedRegion] = useState<EventRegion | null>(
    null,
  );

  // Todas as regiões que produziram destaque nesta rodada, com a marca de
  // quem ainda joga hoje. As pendentes aparecem bloqueadas em vez de sumirem:
  // saber que Americas sai no fim do dia é informação, e um chip que
  // desaparece não a dá.
  const regions = useMemo(() => {
    if (!highlights) return [];
    const present = [...new Set(highlights.scorers.map((row) => row.region))];
    return sortRegions(present).map((region) => ({
      region,
      pending: highlights.pending.includes(region),
    }));
  }, [highlights]);

  // Nenhum jogador pontuado é outra coisa que "a região ainda joga hoje": a
  // primeira é falta de dado, a segunda é uma espera deliberada. Dizer uma
  // pela outra mandaria o usuário aguardar um fim de dia que não vai mudar
  // nada.
  if (!highlights || highlights.scorers.length === 0) {
    return (
      <Panel title="Destaques da rodada">
        <p className="text-sm text-muted-foreground">
          Os destaques aparecem assim que a primeira partida for pontuada.
        </p>
      </Panel>
    );
  }

  const { partial, pending } = highlights;

  // Uma região que ainda joga hoje não entra nem no "Todos": senão o agregado
  // devolveria pelas costas o que o chip dela esconde.
  const visible: RoundHighlightsData = {
    ...highlights,
    scorers: highlights.scorers.filter((row) => !pending.includes(row.region)),
    movers: highlights.movers.filter((row) => !pending.includes(row.region)),
  };

  const available = regions.filter((row) => !row.pending);

  if (available.length === 0) {
    return (
      <Panel title="Destaques da rodada">
        <p className="text-sm text-muted-foreground">
          Os destaques saem quando o último jogo do dia terminar.
        </p>
      </Panel>
    );
  }

  const { topScorer, risers, fallers } = highlightsFor(
    visible,
    selectedRegion,
    PRICE_MOVER_LIMIT,
  );

  return (
    // Dentro do `<Panel>` como as outras duas seções da coluna: sem ele a
    // faixa de destaques perdia o título justamente quando tem conteúdo.
    <Panel
      title="Destaques da rodada"
      actions={
        regions.length > 1 && (
          <div
            role="group"
            aria-label="Filtrar por região"
            className="flex flex-wrap gap-1.5"
          >
            <FilterChip
              label="Todos"
              active={selectedRegion === null}
              onSelect={() => setSelectedRegion(null)}
            />
            {regions.map(({ region, pending: waiting }) => (
              <FilterChip
                key={region}
                label={regionLabel(region)}
                title={
                  waiting
                    ? `Os destaques de ${regionLabel(region)} saem quando o último jogo de hoje terminar.`
                    : undefined
                }
                accent={regionColor(region)}
                disabled={waiting}
                active={selectedRegion === region}
                onSelect={() => setSelectedRegion(region)}
              />
            ))}
          </div>
        )
      }
    >
      {partial && (
        <p
          // `polite`: o texto muda quando um jogo termina e a página é
          // recarregada — nunca no meio de uma leitura.
          aria-live="polite"
          className="mb-3.5 text-xs text-muted-foreground"
        >
          <span className="font-bold text-primary uppercase">Parcial</span> —
          atualiza conforme as partidas da rodada terminam. As variações de
          preço são projeções até o fechamento.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <ScorerHighlight
          title="Maior Pontuador"
          positive
          player={
            topScorer
              ? {
                  nickname: topScorer.nickname,
                  role: topScorer.role,
                  score: topScorer.points,
                }
              : null
          }
        />
        <PriceMoverList
          title="Maiores Valorizações"
          movers={risers}
          tone="positive"
        />
        <PriceMoverList
          title="Maiores Desvalorizações"
          movers={fallers}
          tone="negative"
        />
      </div>
    </Panel>
  );
}
