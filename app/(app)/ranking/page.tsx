import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ChampionshipRail } from "@/components/championship/championship-rail";
import { EmptyChampionships } from "@/components/championship/empty-championships";
import { InviteMemberForm } from "@/components/championship/invite-member-form";
import { PendingInvites } from "@/components/championship/pending-invites";
import { StandingsList } from "@/components/championship/standings-list";
import { StandingsPodium } from "@/components/championship/standings-podium";
import { Panel } from "@/components/layout/panel";
import { PageContainer } from "@/components/layout/page-container";
import { RegionDisplaySync } from "@/components/layout/region-display";
import { RegionTabs } from "@/components/team/region-tabs";
import { auth } from "@/lib/auth";
import {
  rankingRegionTabs,
  resolveRankingRegion,
} from "@/lib/championship/regions";
import {
  getStandingRows,
  listPendingInvites,
  listPendingMembers,
  listUserChampionshipsWithPosition,
} from "@/lib/championship/queries";
import { rankStandings } from "@/lib/championship/standings";
import { parseTeamRegion, regionColor, regionLabel } from "@/lib/round/regions";
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
  const explicit = parseTeamRegion(searchParams.region);

  // Mesma resolução de cookie/header que `/my-team` usa — é o fallback
  // quando nem `?c=` nem `?region=` decidem a aba.
  const { region: fallback, available } = await resolveRegion(
    searchParams.region,
  );

  const [championships, pendingInvites] = await Promise.all([
    listUserChampionshipsWithPosition(session.user.id),
    listPendingInvites(session.user.id),
  ]);

  // Um `?c=` de campeonato alheio nunca aparece aqui: `listUserChampionships`
  // só traz campeonatos em que o usuário é membro aceito.
  const requested = championships.find((c) => c.id === requestedId);
  const region = resolveRankingRegion({
    championships,
    requested,
    explicit,
    fallback,
  });
  const tabs = rankingRegionTabs(championships, available);
  const inRegion = championships.filter((c) => c.region === region);
  const selected = requested ?? inRegion[0];

  // Depois de saber a região da tela — o header tem de concordar com a aba.
  // Memoizada por `(userId, userName, region)`: quando a aba pedida bate com
  // a do layout, reaproveita a mesma consulta; quando difere, há uma segunda
  // consulta — o preço de o header mostrar o saldo do time daquela aba.
  const overview = await getTeamOverview(
    session.user.id,
    session.user.username ?? session.user.name,
    region,
  );

  const regionSync = overview ? (
    <RegionDisplaySync
      region={overview.region}
      balanceCents={overview.summary.balanceCents}
    />
  ) : null;

  const regionChip = (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: regionColor(region) }}
      />
      {regionLabel(region)}
    </span>
  );

  if (!selected) {
    return (
      <PageContainer>
        {regionSync}
        <PendingInvites invites={pendingInvites} />
        <RegionTabs current={region} available={tabs} pathname="/ranking" />
        <EmptyChampionships region={region} />
      </PageContainer>
    );
  }

  const rows = await getStandingRows(selected.id);
  const standings = rankStandings(rows, session.user.id);
  const isOwner = selected.ownerId === session.user.id;
  const pendingMembers = isOwner ? await listPendingMembers(selected.id) : [];

  return (
    <PageContainer>
      {regionSync}
      <PendingInvites invites={pendingInvites} />

      <RegionTabs current={region} available={tabs} pathname="/ranking" />

      <ChampionshipRail
        championships={inRegion}
        selectedId={selected.id}
        region={region}
      />

      <Panel title="Classificação" tourId="campeonatos" actions={regionChip}>
        <StandingsPodium standings={standings} />
        <StandingsList standings={standings} />
        <p className="mt-3 text-xs text-muted-foreground">
          A pontuação considera o seu time de {regionLabel(selected.region)}{" "}
          nesta rodada.
        </p>
      </Panel>

      {isOwner && (
        <div className="mt-6">
          <Panel title="Convidados">
            <InviteMemberForm
              championshipId={selected.id}
              region={selected.region}
            />
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
    </PageContainer>
  );
}
