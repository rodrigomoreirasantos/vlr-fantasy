import { Crosshair, Home, Menu, Trophy, User } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { FormationBoard } from "@/components/team/formation-board";
import { EmptyPlayerRow, PlayerRow } from "@/components/team/player-row";
import { ScorerHighlight } from "@/components/team/scorer-highlight";
import { TeamStats } from "@/components/team/team-stats";
import { auth } from "@/lib/auth";
import { placeholderRoster, placeholderSummary } from "@/lib/team/placeholder";
import { highestScorer, lowestScorer } from "@/lib/team/score";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Meu Time | VLR Fantasy",
};

/**
 * Seções do produto. Ainda não são links: só `/my-team` existe hoje, então
 * criar `href` para as demais renderia navegação quebrada.
 */
const SECTIONS = [
  { label: "Início", icon: Home },
  { label: "Perfil", icon: User },
  { label: "Escalação", icon: Crosshair, current: true },
  { label: "Ranking", icon: Trophy },
  { label: "Menu", icon: Menu },
];

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "clip-corner bg-card p-[18px] ring-1 ring-border [--clip:16px]",
        className,
      )}
    >
      <h2 className="mb-3.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function MyTeamPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const roster = placeholderRoster();
  const summary = placeholderSummary();
  const best = highestScorer(roster);
  const worst = lowestScorer(roster);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-sidebar px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold tracking-tight text-primary">
            VLR<span className="text-foreground">FANTASY</span>
          </span>
          <span aria-hidden className="h-5 w-px bg-border" />
          <span className="text-base font-extrabold tracking-wide uppercase">
            {summary.name}
          </span>
          <span aria-hidden className="h-5 w-px bg-border" />
          <span className="text-base font-extrabold text-info tabular-nums">
            {summary.points.toFixed(1)}{" "}
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              pts
            </span>
          </span>
        </div>

        <nav aria-label="Seções" className="flex items-center gap-6 xl:gap-9">
          {SECTIONS.map(({ label, icon: Icon, current }) => (
            <span
              key={label}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex items-center gap-[7px] text-[13px]",
                current
                  ? "font-bold text-primary"
                  : "font-semibold text-muted-foreground",
              )}
            >
              <Icon aria-hidden className="size-[17px]" />
              {label}
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Olá, <span className="text-foreground">{session.user.name}</span>
          </span>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-9">
        <div className="mb-6 grid items-start gap-6 lg:grid-cols-[420px_1fr]">
          <Panel title="Resumo">
            <ul className="flex flex-col gap-2">
              {roster.map((slot, index) =>
                slot.player ? (
                  <PlayerRow
                    key={slot.player.id}
                    player={slot.player}
                    captain={slot.captain}
                  />
                ) : (
                  <EmptyPlayerRow key={`slot-${index}`} position={index + 1} />
                ),
              )}
            </ul>
          </Panel>

          <Panel title="Time Montado">
            <FormationBoard roster={roster} />
          </Panel>
        </div>

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
    </div>
  );
}
