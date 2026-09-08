"use client";

import {
  Crosshair,
  Home,
  Menu,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { TeamCrest } from "@/components/crest/team-crest";
import { useRegionDisplay } from "@/components/layout/region-display";
import type { Crest } from "@/lib/crest/types";
import { regionColor, regionLabel } from "@/lib/round/regions";
import { formatScore } from "@/lib/team/score";
import { cn } from "@/lib/utils";

/**
 * Seções do produto. Itens sem `href` ainda não têm rota própria e
 * continuam `<span>` inertes — mesmo motivo do comentário original em
 * `app/my-team/page.tsx` antes da extração deste componente.
 */
type Section = { label: string; icon: LucideIcon; href?: string };

const SECTIONS: Section[] = [
  { label: "Início", icon: Home, href: "/home" },
  { label: "Perfil", icon: User, href: "/profile" },
  { label: "Escalação", icon: Crosshair, href: "/my-team" },
  { label: "Ranking", icon: Trophy, href: "/ranking" },
  { label: "Menu", icon: Menu },
];

export type AppHeaderProps = {
  teamName: string;
  crest: Crest;
  userName: string;
};

/**
 * Região e pontuação **não** são props: elas mudam a cada troca de aba de
 * região, e o layout que renderiza este header não re-renderiza na
 * navegação (ver `components/layout/region-display.tsx`). Vêm do contexto,
 * que a página republica a cada navegação — é o que impede o header de
 * mostrar os pontos de uma região e a tela ao lado os de outra.
 */
export function AppHeader({ teamName, crest, userName }: AppHeaderProps) {
  const pathname = usePathname();
  const { region, points } = useRegionDisplay();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-sidebar px-6 py-3">
      <div className="flex items-center gap-4">
        <span className="text-lg font-bold tracking-tight text-primary">
          VLR<span className="text-foreground">FANTASY</span>
        </span>
        <span aria-hidden className="h-5 w-px bg-border" />
        <span className="flex items-center gap-2">
          <TeamCrest crest={crest} size="sm" title={`Brasão de ${teamName}`} />
          <span className="text-base font-extrabold tracking-wide uppercase">
            {teamName}
          </span>
        </span>
        <span aria-hidden className="h-5 w-px bg-border" />
        <span className="text-base font-extrabold text-info tabular-nums">
          {formatScore(points)}{" "}
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">
            pts
          </span>
        </span>
        <span aria-hidden className="h-5 w-px bg-border" />
        <span
          className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase"
          style={{ color: regionColor(region) }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: regionColor(region) }}
          />
          {regionLabel(region)}
        </span>
      </div>

      <nav aria-label="Seções" className="flex items-center gap-6 xl:gap-9">
        {SECTIONS.map(({ label, icon: Icon, href }) => {
          const current = href ? pathname.startsWith(href) : false;
          const className = cn(
            "flex items-center gap-[7px] text-[13px]",
            current
              ? "font-bold text-primary"
              : "font-semibold text-muted-foreground",
          );

          if (!href) {
            return (
              <span key={label} className={className}>
                <Icon aria-hidden className="size-[17px]" />
                {label}
              </span>
            );
          }

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
