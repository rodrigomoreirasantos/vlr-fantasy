import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { RegionDisplayProvider } from "@/components/layout/region-display";
import { TimezoneProvider, TimezoneSync } from "@/components/layout/timezone";
import { TourProvider } from "@/components/tour/tour-provider";
import { auth } from "@/lib/auth";
import { resolveTimezone } from "@/lib/round/timezone-selection";
import { resolveRegion } from "@/lib/team/region-selection";
import { getTeamOverview } from "@/lib/team/queries";

/**
 * Layout compartilhado por toda tela logada (`/my-team`, `/ranking`, …):
 * resolve a sessão, garante o time e renderiza o header com navegação —
 * extraído de `app/my-team/page.tsx`, a única tela logada antes desta
 * feature. `getTeamOverview` é memoizada por request, então a chamada
 * daqui e a de `/my-team` resolvem numa única consulta — desde que os três
 * argumentos batam, `region` incluída (`resolveRegion`, sem `?region=`
 * explícito: o layout não recebe `searchParams`, então segue o header do
 * proxy / cookie / default, a mesma região que a página resolve).
 *
 * `resolveTimezone()` entra aqui, e não em cada página, porque — ao contrário
 * da região — o fuso de exibição **não muda na navegação**: não existe
 * `?tz=` nem ação que o altere, só o `TimezoneSync` do próprio layout
 * corrigindo via cookie e `router.refresh()` (`components/layout/timezone.tsx`),
 * que reavalia `cookies()`/`headers()` do zero — layout incluído.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  const { region, available } = await resolveRegion();
  const overview = await getTeamOverview(
    session.user.id,
    session.user.username ?? session.user.name,
    region,
  );
  if (!overview) {
    throw new Error("Não foi possível carregar o seu time.");
  }
  const tz = await resolveTimezone();

  return (
    <div className="min-h-screen bg-background">
      {/*
        O layout só **semeia** região e saldo: ele não re-renderiza na
        navegação, então quem os mantém em dia é cada página, via
        `<RegionDisplaySync>` (components/layout/region-display.tsx). Nome e
        brasão continuam props normais — são do usuário (`fantasy_identity`),
        iguais nas cinco regiões.
      */}
      <TimezoneProvider tz={tz}>
        <TimezoneSync serverTz={tz} />
        <RegionDisplayProvider
          initial={{
            region: overview.region,
            balanceCents: overview.summary.balanceCents,
          }}
        >
          {/* `tourCompletedAt` nasce `null` para todo mundo, contas antigas
              incluídas (fantasy-identity), então o tour abre sozinho uma
              única vez — depois disso o botão "Ver tutorial" (menu da
              conta) é o único jeito de vê-lo de novo. */}
          <TourProvider autoStart={overview.tourCompletedAt === null}>
            <AppHeader
              teamName={overview.summary.name}
              crest={overview.summary.crest}
              displayName={session.user.name}
              username={session.user.username ?? null}
              available={available}
            />
            {children}
            <BottomNav />
          </TourProvider>
        </RegionDisplayProvider>
      </TimezoneProvider>
    </div>
  );
}
