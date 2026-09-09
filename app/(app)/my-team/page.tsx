import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LiveRefresh } from "@/components/layout/live-refresh";
import { RegionDisplaySync } from "@/components/layout/region-display";
import { RegionTabs } from "@/components/team/region-tabs";
import { RosterPanel } from "@/components/team/roster-panel";
import { ScorerHighlight } from "@/components/team/scorer-highlight";
import { TeamStats } from "@/components/team/team-stats";
import { auth } from "@/lib/auth";
import { myTeamRefreshMs } from "@/lib/market/window";
import { resolveRegion } from "@/lib/team/region-selection";
import { getTeamOverview } from "@/lib/team/queries";
import { highestScorer, lowestScorer } from "@/lib/team/score";

export const metadata: Metadata = {
  title: "Meu Time | VLR Fantasy",
};

export default async function MyTeamPage(props: PageProps<"/my-team">) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const { region, available } = await resolveRegion(searchParams.region);

  // Memoizada por request: o layout logado já pediu esta mesma visão, então
  // aqui não há segunda consulta ao banco. Os três argumentos precisam bater
  // com os do layout para a memoização (`cache()`) reaproveitar a chamada.
  const overview = await getTeamOverview(
    session.user.id,
    session.user.username ?? session.user.name,
    region,
  );
  if (!overview) {
    throw new Error("Não foi possível carregar o seu time.");
  }

  const { summary, roster, lockedTeams } = overview;

  const best = highestScorer(roster);
  const worst = lowestScorer(roster);

  return (
    <main className="mx-auto max-w-7xl px-6 py-9">
      {/* Publica para o header a região desta navegação — o layout não
          re-renderiza ao trocar de aba. */}
      <RegionDisplaySync region={region} balanceCents={summary.balanceCents} />

      <RegionTabs
        current={region}
        available={available}
        params={searchParams}
      />

      {/* O catálogo do mercado não vem mais no HTML da página — só quando o
          usuário abre uma vaga (`loadMarket`, Server Action). O que se
          atualiza sozinho aqui é o resto: saldo, trava do dia e o
          fechamento, no ritmo de `myTeamRefreshMs` (rápido perto do
          fechamento, parado longe dele). */}
      <LiveRefresh intervalMs={myTeamRefreshMs(summary.market.closesAt)} />

      <RosterPanel
        roster={roster}
        balanceCents={summary.balanceCents}
        marketOpen={summary.market.open}
        lockedTeams={lockedTeams}
        closesIn={summary.market.closesIn}
        closesAt={summary.market.closesAt}
      />

      <TeamStats summary={summary} />

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <ScorerHighlight title="Maior Pontuador" player={best} positive />
        <ScorerHighlight
          title="Menor Pontuador"
          player={worst}
          positive={false}
        />
      </div>
    </main>
  );
}
