import { Panel } from "@/components/layout/panel";
import { PriceMoverList } from "@/components/home/price-mover-list";
import { ScorerHighlight } from "@/components/team/scorer-highlight";
import type { RoundHighlights as RoundHighlightsData } from "@/lib/home/types";

export type RoundHighlightsProps = {
  highlights: RoundHighlightsData | null;
};

/**
 * Destaques do jogo inteiro: maior pontuador, altas e quedas.
 *
 * Enquanto a rodada corre, os números são parciais — sobem a cada partida
 * encerrada e as variações de preço ainda são projeções. A tela diz isso em
 * voz alta: um número que muda sem avisar é pior do que um número ausente.
 */
export function RoundHighlights({ highlights }: RoundHighlightsProps) {
  if (!highlights) {
    return (
      <Panel title="Destaques da rodada">
        <p className="text-sm text-muted-foreground">
          Os destaques aparecem assim que a primeira partida for pontuada.
        </p>
      </Panel>
    );
  }

  const { roundNumber, partial, topScorer, risers, fallers } = highlights;

  return (
    // Dentro do `<Panel>` como as outras duas seções da coluna: sem ele a
    // faixa de destaques perdia o título justamente quando tem conteúdo.
    <Panel title={`Destaques da rodada ${roundNumber}`}>
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
