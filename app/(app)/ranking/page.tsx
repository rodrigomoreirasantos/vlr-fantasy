import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ChampionshipSelector } from "@/components/championship/championship-selector";
import { CreateChampionshipDialog } from "@/components/championship/create-championship-dialog";
import { EmptyChampionships } from "@/components/championship/empty-championships";
import { InviteMemberForm } from "@/components/championship/invite-member-form";
import { PendingInvites } from "@/components/championship/pending-invites";
import { StandingsTable } from "@/components/championship/standings-table";
import { Panel } from "@/components/layout/panel";
import { RegionDisplaySync } from "@/components/layout/region-display";
import { auth } from "@/lib/auth";
import {
  getStandingRows,
  listPendingInvites,
  listPendingMembers,
  listUserChampionships,
} from "@/lib/championship/queries";
import { rankStandings } from "@/lib/championship/standings";
import { regionLabel } from "@/lib/round/regions";
import { resolveRegion } from "@/lib/team/region-selection";
import { getTeamOverview } from "@/lib/team/queries";

export const metadata: Metadata = {
  title: "Ranking | VLR Fantasy",
};

export default async function RankingPage(props: PageProps<"/ranking">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const requestedId =
    typeof searchParams.c === "string" ? searchParams.c : undefined;

  // Mesmos argumentos do layout logado (`app/(app)/layout.tsx`): a
  // memoização por request de `getTeamOverview` evita uma segunda consulta
  // ao time, só para manter o header em dia nesta navegação.
  const { region } = await resolveRegion();
  const [championships, pendingInvites, overview] = await Promise.all([
    listUserChampionships(session.user.id),
    listPendingInvites(session.user.id),
    getTeamOverview(
      session.user.id,
      session.user.username ?? session.user.name,
      region,
    ),
  ]);

  // Mantém o header na região desta navegação — ver
  // `components/layout/region-display.tsx`.
  const regionSync = overview ? (
    <RegionDisplaySync
      region={overview.region}
      balanceCents={overview.summary.balanceCents}
    />
  ) : null;

  if (championships.length === 0) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-9">
        {regionSync}
        <PendingInvites invites={pendingInvites} />
        <EmptyChampionships />
      </main>
    );
  }

  // Um `?c=` de campeonato alheio cai no primeiro da lista — nunca vaza
  // classificação de fora (`listUserChampionships` só traz campeonatos em
  // que o próprio usuário é membro aceito).
  const selected =
    championships.find((c) => c.id === requestedId) ?? championships[0];

  const rows = await getStandingRows(selected.id);
  const standings = rankStandings(rows, session.user.id);
  const isOwner = selected.ownerId === session.user.id;
  const pendingMembers = isOwner ? await listPendingMembers(selected.id) : [];

  return (
    <main className="mx-auto max-w-7xl px-6 py-9">
      {regionSync}
      <PendingInvites invites={pendingInvites} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <ChampionshipSelector
          championships={championships}
          selectedId={selected.id}
        />
        <CreateChampionshipDialog />
      </div>

      <Panel title="Classificação">
        <StandingsTable standings={standings} />
        <p className="mt-3 text-xs text-muted-foreground">
          A pontuação considera o seu time de {regionLabel(selected.region)}{" "}
          nesta rodada.
        </p>
      </Panel>

      {isOwner && (
        <div className="mt-6">
          <Panel title="Convidados">
            <InviteMemberForm championshipId={selected.id} />
            {pendingMembers.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {pendingMembers.map((member) => (
                  <li
                    key={member.memberId}
                    className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 text-sm"
                  >
                    <span>{member.userName}</span>
                    <span className="text-muted-foreground">
                      {member.username ? `@${member.username}` : "—"} · pendente
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </main>
  );
}
