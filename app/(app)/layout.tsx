import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { auth } from "@/lib/auth";
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

  const { region } = await resolveRegion();
  const overview = await getTeamOverview(
    session.user.id,
    session.user.username ?? session.user.name,
    region,
  );
  if (!overview) {
    throw new Error("Não foi possível carregar o seu time.");
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        teamName={overview.summary.name}
        crest={overview.summary.crest}
        points={overview.summary.points}
        userName={session.user.name}
        region={overview.region}
      />
      {children}
    </div>
  );
}
