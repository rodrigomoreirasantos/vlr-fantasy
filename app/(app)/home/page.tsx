import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LiveRefresh } from "@/components/home/live-refresh";
import { NextRoundBrief } from "@/components/home/next-round-brief";
import { RoundHighlights } from "@/components/home/round-highlights";
import { RoundRecap } from "@/components/home/round-recap";
import { UpcomingMatches } from "@/components/home/upcoming-matches";
import { PendingInvites } from "@/components/championship/pending-invites";
import { auth } from "@/lib/auth";
import { getHomeSummary } from "@/lib/home/queries";
import { refreshIntervalMs } from "@/lib/home/summary";

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

      {/* A Home se atualiza sozinha enquanto a aba estiver aberta: os placares
          chegam pelo pipeline do vlr.gg ao longo da semana, e ninguém deveria
          precisar de F5 para ver quem pontuou. */}
      <LiveRefresh intervalMs={refreshIntervalMs(summary)} />

      <PendingInvites invites={summary.pendingInvites} />
      <RoundRecap
        recap={summary.recap}
        hasFinishedRound={summary.hasFinishedRound}
      />
      <NextRoundBrief nextRound={summary.nextRound} />
      {/* O `now` vem do servidor para o primeiro paint e a hidratação
          usarem exatamente o mesmo instante — mesmo motivo do
          `initialCountdown` de `<MarketCountdown>`. */}
      <UpcomingMatches upcoming={summary.upcoming} now={new Date()} />
      <RoundHighlights highlights={summary.highlights} />
    </main>
  );
}
