import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RosterPanel } from "@/components/team/roster-panel";
import { ScorerHighlight } from "@/components/team/scorer-highlight";
import { TeamStats } from "@/components/team/team-stats";
import { auth } from "@/lib/auth";
import { getMarketByRole, getTeamOverview } from "@/lib/team/queries";
import { highestScorer, lowestScorer } from "@/lib/team/score";
import { PLAYER_ROLES } from "@/lib/team/types";

export const metadata: Metadata = {
  title: "Meu Time | VLR Fantasy",
};

export default async function MyTeamPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  // Memoizada por request: o layout logado já pediu esta mesma visão, então
  // aqui não há segunda consulta ao banco. O segundo argumento precisa bater
  // com o do layout para a memoização (`cache()`) reaproveitar a chamada.
  const overview = await getTeamOverview(
    session.user.id,
    session.user.username ?? session.user.name,
  );
  if (!overview) {
    throw new Error("Não foi possível carregar o seu time.");
  }

  const { summary, roster } = overview;
  // Qualquer função pode ocupar qualquer vaga — o mercado sempre traz as
  // quatro (lib/market/eligibility.ts).
  const market = await getMarketByRole(PLAYER_ROLES);

  const best = highestScorer(roster);
  const worst = lowestScorer(roster);

  return (
    <main className="mx-auto max-w-7xl px-6 py-9">
      <RosterPanel
        roster={roster}
        market={market}
        balanceCents={summary.balanceCents}
        marketOpen={summary.market.open}
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
