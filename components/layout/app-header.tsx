"use client";

import { Crosshair, Home, Trophy, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { TeamCrest } from "@/components/crest/team-crest";
import { RegionSwitcher } from "@/components/layout/region-switcher";
import { useRegionDisplay } from "@/components/layout/region-display";
import { PlayerPrice } from "@/components/team/player-price";
import type { Crest } from "@/lib/crest/types";
import type { TeamRegion } from "@/lib/round/regions";
import { cn } from "@/lib/utils";

type Section = { label: string; icon: LucideIcon; href: string };

const SECTIONS: Section[] = [
  { label: "Início", icon: Home, href: "/home" },
  { label: "Perfil", icon: User, href: "/profile" },
  { label: "Escalação", icon: Crosshair, href: "/my-team" },
  { label: "Ranking", icon: Trophy, href: "/ranking" },
];

export type AppHeaderProps = {
  teamName: string;
  crest: Crest;
  userName: string;
  /** As regiões que o menu de troca pode oferecer agora — vem do layout (`resolveRegion`). */
  available: readonly TeamRegion[];
};

/**
 * Região e saldo **não** são props: eles mudam a cada troca de aba de
 * região, e o layout que renderiza este header não re-renderiza na
 * navegação (ver `components/layout/region-display.tsx`). Vêm do contexto,
 * que a página republica a cada navegação — é o que impede o header de
 * mostrar o saldo de uma região e a tela ao lado o de outra.
 */
export function AppHeader({
  teamName,
  crest,
  userName,
  available,
}: AppHeaderProps) {
  const pathname = usePathname();
  const { region, balanceCents } = useRegionDisplay();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-sidebar px-6 py-3">
      <div className="flex items-center gap-4">
        <Link
          href="/home"
          className="cursor-pointer text-lg font-bold tracking-tight text-primary"
        >
          VLR<span className="text-foreground">FANTASY</span>
        </Link>
        <span aria-hidden className="h-5 w-px bg-border" />
        <span className="flex items-center gap-2">
          <TeamCrest crest={crest} size="sm" title={`Brasão de ${teamName}`} />
          <span className="text-base font-extrabold tracking-wide uppercase">
            {teamName}
          </span>
        </span>
        <span aria-hidden className="h-5 w-px bg-border" />
        <span className="flex items-baseline gap-1">
          <span className="sr-only">Saldo</span>
          <PlayerPrice
            priceCents={balanceCents}
            className="text-base font-extrabold"
          />
          <span
            aria-hidden
            className="text-[11px] font-semibold text-muted-foreground uppercase"
          >
            cr
          </span>
        </span>
        <span aria-hidden className="h-5 w-px bg-border" />
        <RegionSwitcher current={region} available={available} />
      </div>

      <nav aria-label="Seções" className="flex items-center gap-6 xl:gap-9">
        {SECTIONS.map(({ label, icon: Icon, href }) => {
          const current = pathname.startsWith(href);
          const className = cn(
            "flex items-center gap-[7px] text-[13px]",
            current
              ? "font-bold text-primary"
              : "font-semibold text-muted-foreground",
          );

          return (
            <Link
              key={label}
              href={href}
              aria-current={current ? "page" : undefined}
              className={className}
            >
              <Icon aria-hidden className="size-[17px]" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          Olá, <span className="text-foreground">{userName}</span>
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
