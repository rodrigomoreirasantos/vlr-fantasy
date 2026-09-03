import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { NextRoundBrief } from "@/components/home/next-round-brief";
import { RoundHighlights } from "@/components/home/round-highlights";
import { RoundRecap } from "@/components/home/round-recap";
import { UpcomingMatches } from "@/components/home/upcoming-matches";
import { PendingInvites } from "@/components/championship/pending-invites";
import { auth } from "@/lib/auth";
import { getHomeSummary } from "@/lib/home/queries";

export const metadata: Metadata = {
  title: "Início | VLR Fantasy",
};

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // Mesmos argumentos do layout logado (`app/(app)/layout.tsx`): a
  // memoização por request de `getTeamOverview` evita uma segunda consulta
  // ao time.
  const summary = await getHomeSummary(
    session.user.id,
    session.user.username ?? session.user.name,
  );

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-9">
      {/* A tela é uma coluna de painéis com `<h2>` cada; o `<h1>` dá o nível
          que faltava para a navegação por leitor de tela. */}
      <h1 className="sr-only">Início</h1>

      <PendingInvites invites={summary.pendingInvites} />
      <RoundRecap
        recap={summary.recap}
        hasFinishedRound={summary.hasFinishedRound}
      />
      <NextRoundBrief nextRound={summary.nextRound} />
      <UpcomingMatches upcoming={summary.upcoming} />
      <RoundHighlights highlights={summary.highlights} />
    </main>
  );
}
