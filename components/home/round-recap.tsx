import { Panel } from "@/components/layout/panel";
import { ChampionshipPlacements } from "@/components/profile/championship-placements";
import type { RoundRecap as RoundRecapData } from "@/lib/home/types";
import { formatCredits, formatCreditsDelta } from "@/lib/market/money";
import { formatScore } from "@/lib/team/score";
import { cn } from "@/lib/utils";

export type RoundRecapProps = {
  recap: RoundRecapData | null;
  /**
   * Distingue os dois motivos de `recap` ser `null` — ninguém fechou rodada
   * ainda, ou este time entrou depois do fechamento. Sem isso a Home diria
   * "a primeira rodada ainda não foi fechada" ao lado dos destaques reais
   * dessa mesma rodada.
   */
  hasFinishedRound: boolean;
};

/** "O que aconteceu": pontos do time, variação de patrimônio e colocações — a última rodada fechada. */
export function RoundRecap({ recap, hasFinishedRound }: RoundRecapProps) {
  if (!recap) {
    return (
      <Panel title="O que aconteceu">
        <p className="text-sm text-muted-foreground">
          {hasFinishedRound
            ? "Seu time ainda não disputou uma rodada fechada. A próxima já conta."
            : "A primeira rodada ainda não foi fechada."}
        </p>
      </Panel>
    );
  }

  const {
    roundNumber,
    points,
    patrimonyCents,
    patrimonyDeltaCents,
    placements,
  } = recap;

  return (
    <Panel title={`O que aconteceu — Rodada ${roundNumber}`}>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Pontos do time
          </p>
          <p className="text-2xl font-extrabold text-info tabular-nums">
            {formatScore(points)}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Patrimônio
          </p>
          <p className="text-2xl font-extrabold tabular-nums">
            {formatCredits(patrimonyCents)}
            {patrimonyDeltaCents !== null && (
              <span
                className={cn(
                  "ml-2 text-sm font-bold",
                  patrimonyDeltaCents >= 0
                    ? "text-success"
                    : "text-destructive",
                )}
              >
                {formatCreditsDelta(patrimonyDeltaCents)}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <ChampionshipPlacements placements={placements} />
      </div>
    </Panel>
  );
}
