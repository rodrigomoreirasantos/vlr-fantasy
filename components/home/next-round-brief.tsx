import { LineupAlerts } from "@/components/home/lineup-alerts";
import { MarketCountdown } from "@/components/home/market-countdown";
import { MatchList } from "@/components/home/match-list";
import { Panel } from "@/components/layout/panel";
import type { NextRoundBrief as NextRoundBriefData } from "@/lib/home/types";

export type NextRoundBriefProps = {
  nextRound: NextRoundBriefData | null;
};

/** "O que vem": countdown do mercado, alertas dos seus 5 e o calendário oficial. */
export function NextRoundBrief({ nextRound }: NextRoundBriefProps) {
  if (!nextRound) {
    return (
      <Panel title="O que vem">
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
    matches,
    myOrganizations,
  } = nextRound;

  return (
    <Panel title={`O que vem — Rodada ${roundNumber}`}>
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

      <div className="mt-4">
        <MatchList matches={matches} myOrganizations={myOrganizations} />
      </div>
    </Panel>
  );
}
