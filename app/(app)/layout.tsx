import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { auth } from "@/lib/auth";
import { getTeamOverview } from "@/lib/team/queries";

/**
 * Layout compartilhado por toda tela logada (`/my-team`, `/ranking`, …):
 * resolve a sessão, garante o time e renderiza o header com navegação —
 * extraído de `app/my-team/page.tsx`, a única tela logada antes desta
 * feature. `getTeamOverview` é memoizada por request, então a chamada
 * daqui e a de `/my-team` resolvem numa única consulta.
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

  const overview = await getTeamOverview(session.user.id, session.user.name);
  if (!overview) {
    throw new Error("Não foi possível carregar o seu time.");
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        teamName={overview.summary.name}
        points={overview.summary.points}
        userName={session.user.name}
      />
      {children}
    </div>
  );
}
