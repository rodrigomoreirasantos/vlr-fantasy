import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Panel } from "@/components/layout/panel";
import { RegionDisplaySync } from "@/components/layout/region-display";
import { AccountPanel } from "@/components/profile/account-panel";
import { AddFriendForm } from "@/components/profile/add-friend-form";
import {
  ChampionshipPlacements,
  type ChampionshipPlacement,
} from "@/components/profile/championship-placements";
import { CrestEditor } from "@/components/profile/crest-editor";
import { FriendRequests } from "@/components/profile/friend-requests";
import { FriendsList } from "@/components/profile/friends-list";
import { TeamNameForm } from "@/components/profile/team-name-form";
import { auth } from "@/lib/auth";
import {
  getStandingRowsByChampionship,
  listUserChampionships,
} from "@/lib/championship/queries";
import { rankStandings } from "@/lib/championship/standings";
import {
  listFriends,
  listIncomingFriendRequests,
} from "@/lib/friendship/queries";
import { hasPasswordAccount } from "@/lib/profile/queries";
import { resolveRegion } from "@/lib/team/region-selection";
import { getTeamOverview } from "@/lib/team/queries";
import { tourTarget } from "@/lib/tour/targets";

export const metadata: Metadata = {
  title: "Perfil | VLR Fantasy",
};

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // `getTeamOverview` é memoizada por request: o layout logado já pediu esta
  // mesma visão com os mesmos argumentos, então não há segunda consulta.
  // Nome e brasão são iguais nas 5 regiões (`fantasy_identity`), então
  // qualquer uma serve aqui — a região resolvida mantém o cache compartilhado
  // com o layout.
  const { region } = await resolveRegion();
  const [overview, championships, friends, incomingRequests, hasPassword] =
    await Promise.all([
      getTeamOverview(
        session.user.id,
        session.user.username ?? session.user.name,
        region,
      ),
      listUserChampionships(session.user.id),
      listFriends(session.user.id),
      listIncomingFriendRequests(session.user.id),
      hasPasswordAccount(session.user.id),
    ]);

  if (!overview) {
    throw new Error("Não foi possível carregar o seu time.");
  }

  // Uma única consulta para todos os campeonatos do usuário — `rankStandings`
  // por grupo extrai a colocação, sem repetir a query por campeonato.
  const standingsByChampionship = await getStandingRowsByChampionship(
    championships.map((championship) => championship.id),
  );

  const placements: ChampionshipPlacement[] = championships.map(
    (championship) => {
      const rows = standingsByChampionship.get(championship.id) ?? [];
      const standing = rankStandings(rows, session.user.id).find(
        (row) => row.isCurrentUser,
      );
      return {
        championship,
        position: standing?.position ?? 0,
        points: standing?.points ?? 0,
      };
    },
  );

  const ownedChampionships = championships.filter(
    (championship) => championship.ownerId === session.user.id,
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-9">
      {/* Mantém o header na região desta navegação — ver
          `components/layout/region-display.tsx`. */}
      <RegionDisplaySync
        region={overview.region}
        balanceCents={overview.summary.balanceCents}
      />

      <div
        {...tourTarget("perfil")}
        className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"
      >
        <div className="flex flex-col gap-6">
          <Panel title="Identidade do time">
            <div className="flex flex-col gap-6">
              <TeamNameForm name={overview.summary.name} />
              <CrestEditor
                crest={overview.summary.crest}
                teamName={overview.summary.name}
              />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <FriendRequests requests={incomingRequests} />

          <Panel title="Amigos">
            <div className="flex flex-col gap-4">
              <AddFriendForm />
              <FriendsList
                friends={friends}
                ownedChampionships={ownedChampionships}
              />
            </div>
          </Panel>

          <Panel title="Meus campeonatos">
            <ChampionshipPlacements placements={placements} />
          </Panel>

          <Panel title="Conta">
            <AccountPanel name={session.user.name} hasPassword={hasPassword} />
          </Panel>
        </div>
      </div>
    </main>
  );
}
