import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LiveRefresh } from "@/components/layout/live-refresh";
import { PageContainer } from "@/components/layout/page-container";
import { RegionDisplaySync } from "@/components/layout/region-display";
import { RoundHighlights } from "@/components/home/round-highlights";
import { TeamPerformance } from "@/components/home/team-performance";
import { UpcomingMatches } from "@/components/home/upcoming-matches";
import { PendingInvites } from "@/components/championship/pending-invites";
import { auth } from "@/lib/auth";
import { getHomeSummary } from "@/lib/home/queries";
import { refreshIntervalMs } from "@/lib/home/summary";
import { resolveRegion } from "@/lib/team/region-selection";
import { getTeamOverview } from "@/lib/team/queries";

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
  // ao time. Sem `?region=` própria — a Home segue a região do header do
  // proxy / cookie / default, a mesma que o layout já resolveu.
  const userName = session.user.username ?? session.user.name;
  const { region } = await resolveRegion();
  // Os dois leem `getTeamOverview` com os mesmos argumentos do layout logado:
  // a memoização por request (`cache()`) resolve tudo numa consulta só.
  const [summary, overview] = await Promise.all([
    getHomeSummary(session.user.id, userName, region),
    getTeamOverview(session.user.id, userName, region),
  ]);

  const roster = (overview?.roster ?? []).flatMap((slot) =>
    slot.player
      ? [
          {
            playerId: slot.player.id,
            nickname: slot.player.nickname,
            photoUrl: slot.player.photoUrl,
          },
        ]
      : [],
  );

  return (
    <PageContainer className="flex flex-col gap-6">
      {/* A tela é uma coluna de painéis com `<h2>` cada; o `<h1>` dá o nível
          que faltava para a navegação por leitor de tela. */}
      <h1 className="sr-only">Início</h1>

      {/* Mantém o header na região desta navegação — ver
          `components/layout/region-display.tsx`. */}
      {overview && (
        <RegionDisplaySync
          region={overview.region}
          balanceCents={overview.summary.balanceCents}
        />
      )}

      {/* A Home se atualiza sozinha enquanto a aba estiver aberta: os placares
          chegam pelo pipeline do vlr.gg ao longo da semana, e ninguém deveria
          precisar de F5 para ver quem pontuou. */}
      <LiveRefresh intervalMs={refreshIntervalMs(summary)} />

      <PendingInvites invites={summary.pendingInvites} />

      {/* Jogos vêm antes do Desempenho do time de propósito: "quando é o
          próximo jogo e até quando dá para mexer no time" é a pergunta mais
          frequente ao abrir a Home, e o painel de Desempenho (gráfico +
          histórico de partidas) é alto o bastante para empurrar o calendário
          inteiro para fora da primeira dobra se vier primeiro.
          O `now` vem do servidor para o primeiro paint e a hidratação
          usarem exatamente o mesmo instante — mesmo motivo do
          `initialCountdown` de `<MarketCountdown>`. */}
      <UpcomingMatches upcoming={summary.upcoming} now={new Date()} />
      <TeamPerformance
        recap={summary.recap}
        hasFinishedRound={summary.hasFinishedRound}
        performances={summary.performances}
        roster={roster}
      />
      <RoundHighlights highlights={summary.highlights} />
    </PageContainer>
  );
}
