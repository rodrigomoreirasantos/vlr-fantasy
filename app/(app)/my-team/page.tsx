import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RosterPanel } from "@/components/team/roster-panel";
import { ScorerHighlight } from "@/components/team/scorer-highlight";
import { TeamStats } from "@/components/team/team-stats";
import { auth } from "@/lib/auth";
import { getMarketByRole, getTeamOverview } from "@/lib/team/queries";
import { highestScorer, lowestScorer } from "@/lib/team/score";
import { PLAYER_ROLES, type PlayerRole } from "@/lib/team/types";

export const metadata: Metadata = {
  title: "Meu Time | VLR Fantasy",
};

export default async function MyTeamPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  // Memoizada por request: o layout logado já pediu esta mesma visão, então
  // aqui não há segunda consulta ao banco.
  const overview = await getTeamOverview(session.user.id, session.user.name);
  if (!overview) {
    throw new Error("Não foi possível carregar o seu time.");
  }

  const { summary, roster } = overview;
  const rolesEscaladas = new Set<PlayerRole>(
    roster.flatMap((slot) => (slot.player ? [slot.player.role] : [])),
  );
  // Uma vaga vazia não tem função exigida: o usuário escolhe entre todas.
  const temVagaVazia = roster.some((slot) => !slot.player);
  const market = await getMarketByRole(
    temVagaVazia ? PLAYER_ROLES : Array.from(rolesEscaladas),
  );

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
