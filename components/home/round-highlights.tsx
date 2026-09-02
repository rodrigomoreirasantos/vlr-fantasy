import { Panel } from "@/components/layout/panel";
import { PriceMoverList } from "@/components/home/price-mover-list";
import { ScorerHighlight } from "@/components/team/scorer-highlight";
import type { RoundHighlights as RoundHighlightsData } from "@/lib/home/types";

export type RoundHighlightsProps = {
  highlights: RoundHighlightsData | null;
};

/** Destaques do jogo inteiro na rodada fechada: maior pontuador, altas e quedas. */
export function RoundHighlights({ highlights }: RoundHighlightsProps) {
  if (!highlights) {
    return (
      <Panel title="Destaques da rodada">
        <p className="text-sm text-muted-foreground">
          Os destaques aparecem depois que a primeira rodada fechar.
        </p>
      </Panel>
    );
  }

  const { topScorer, risers, fallers } = highlights;

  return (
    // Dentro do `<Panel>` como as outras duas seções da coluna: sem ele a
    // faixa de destaques perdia o título justamente quando tem conteúdo.
    <Panel title="Destaques da rodada">
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
