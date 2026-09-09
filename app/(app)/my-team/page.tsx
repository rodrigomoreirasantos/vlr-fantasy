import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RegionDisplaySync } from "@/components/layout/region-display";
import { RegionTabs } from "@/components/team/region-tabs";
import { RosterPanel } from "@/components/team/roster-panel";
import { ScorerHighlight } from "@/components/team/scorer-highlight";
import { TeamStats } from "@/components/team/team-stats";
import { auth } from "@/lib/auth";
import { resolveRegion } from "@/lib/team/region-selection";
import { getMarketByRole, getTeamOverview } from "@/lib/team/queries";
import { highestScorer, lowestScorer } from "@/lib/team/score";
import { PLAYER_ROLES } from "@/lib/team/types";

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

  const { summary, roster, lockedTeams, scope } = overview;
  // Qualquer função pode ocupar qualquer vaga — o mercado sempre traz as
  // quatro (lib/market/eligibility.ts), recortado ao escopo do time.
  const market = await getMarketByRole(PLAYER_ROLES, scope);

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

      <RosterPanel
        roster={roster}
        market={market}
        scope={scope}
        balanceCents={summary.balanceCents}
        marketOpen={summary.market.open}
        lockedTeams={lockedTeams}
        closesIn={summary.market.closesIn}
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
