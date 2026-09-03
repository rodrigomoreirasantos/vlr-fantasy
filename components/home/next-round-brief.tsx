import { LineupAlerts } from "@/components/home/lineup-alerts";
import { MarketCountdown } from "@/components/home/market-countdown";
import { Panel } from "@/components/layout/panel";
import type { NextRoundBrief as NextRoundBriefData } from "@/lib/home/types";

export type NextRoundBriefProps = {
  nextRound: NextRoundBriefData | null;
};

/**
 * "Sua rodada": o que só o usuário vê — quanto falta para o mercado fechar e o
 * que está errado nos seus 5.
 *
 * O calendário da rodada saiu daqui de propósito. Desde que as rodadas passaram
 * a ser derivadas da semana do circuito (`syncRoundsFromMatches`), essa lista
 * era a mesma de `<UpcomingMatches>` logo abaixo — duas vezes o mesmo jogo na
 * mesma tela, e nenhuma das duas dizendo nada que a outra não dissesse.
 */
export function NextRoundBrief({ nextRound }: NextRoundBriefProps) {
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
    alerts,
  } = nextRound;

  return (
    <Panel title={`Sua rodada ${roundNumber}`}>
      <MarketCountdown
        opensAt={marketOpensAt}
        closesAt={marketClosesAt}
        initialCountdown={marketCountdown}
      />

      <div className="mt-4">
        {alerts.length > 0 ? (
          <LineupAlerts alerts={alerts} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Seus 5 jogadores estão confirmados.
          </p>
        )}
      </div>
    </Panel>
  );
}
