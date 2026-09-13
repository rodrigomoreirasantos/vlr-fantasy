"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TeamCrest } from "@/components/crest/team-crest";
import { AccountMenu } from "@/components/layout/account-menu";
import { RegionSwitcher } from "@/components/layout/region-switcher";
import { useRegionDisplay } from "@/components/layout/region-display";
import { SECTIONS } from "@/components/layout/sections";
import { PlayerPrice } from "@/components/team/player-price";
import type { Crest } from "@/lib/crest/types";
import type { TeamRegion } from "@/lib/round/regions";
import { tourTarget } from "@/lib/tour/targets";
import { cn } from "@/lib/utils";

export type AppHeaderProps = {
  teamName: string;
  crest: Crest;
  /** `user.name` — o nome de exibição, editável em `/profile`. */
  displayName: string;
  /** `user.username` — o `@login` imutável, exibido no `AccountMenu` (plano 21). */
  username: string | null;
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
  displayName,
  username,
  available,
}: AppHeaderProps) {
  const pathname = usePathname();
  const { region, balanceCents } = useRegionDisplay();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border bg-sidebar/95 px-3 py-2.5 backdrop-blur sm:gap-4 sm:px-6 sm:py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <Link
          href="/home"
          className="shrink-0 cursor-pointer text-lg font-bold tracking-tight text-primary"
        >
          VLR<span className="hidden text-foreground sm:inline">FANTASY</span>
        </Link>
        <span aria-hidden className="hidden h-5 w-px shrink-0 bg-border md:inline-block" />
        <span className="flex min-w-0 items-center gap-2">
          <TeamCrest crest={crest} size="sm" title={`Brasão de ${teamName}`} />
          <span className="hidden truncate text-base font-extrabold tracking-wide uppercase md:inline">
            {teamName}
          </span>
        </span>
        <span aria-hidden className="hidden h-5 w-px shrink-0 bg-border md:inline-block" />
        <span
          {...tourTarget("saldo")}
          className="flex shrink-0 items-baseline gap-1"
        >
          <span className="sr-only">Saldo</span>
          <PlayerPrice
            priceCents={balanceCents}
            className="text-sm font-extrabold sm:text-base"
          />
          <span
            aria-hidden
            className="text-[10px] font-semibold text-muted-foreground uppercase sm:text-[11px]"
          >
            cr
          </span>
        </span>
        <span aria-hidden className="hidden h-5 w-px shrink-0 bg-border md:inline-block" />
        <RegionSwitcher current={region} available={available} />
      </div>

      <nav aria-label="Seções" className="hidden items-center gap-6 md:flex xl:gap-9">
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

      <div className="shrink-0">
        <AccountMenu displayName={displayName} username={username} />
      </div>
    </header>
  );
}
