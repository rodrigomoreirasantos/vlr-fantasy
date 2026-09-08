import Link from "next/link";

import { chipClasses } from "@/components/home/chip-classes";
import { regionColor, regionLabel, type TeamRegion } from "@/lib/round/regions";

export type RegionTabsProps = {
  current: TeamRegion;
  /** As regiões que a UI pode oferecer agora — 5 com torneio internacional, 4 sem (`resolveRegion`). */
  available: readonly TeamRegion[];
};

/**
 * A troca de time por região (`.claude/plans/10-time-por-regiao.md`,
 * decisão 8) — `<Link>`, não botão: é navegação de verdade, via
 * `?region=`, que o `proxy.ts` intercepta para gravar o cookie. URL
 * compartilhável, back/forward funcionam, e a troca sobrevive sem JS.
 *
 * A aba Internacional some sozinha quando `available` não a inclui — nada é
 * apagado no banco, só a oferta some da tela (ver `resolveRegion`).
 */
export function RegionTabs({ current, available }: RegionTabsProps) {
  return (
    <nav aria-label="Região" className="mb-6 flex flex-wrap items-center gap-2">
      {available.map((region) => {
        const active = region === current;
        return (
          <Link
            key={region}
            href={`/my-team?region=${region}`}
            aria-current={active ? "page" : undefined}
            className={chipClasses({ active })}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ backgroundColor: regionColor(region) }}
            />
            {regionLabel(region)}
          </Link>
        );
      })}
    </nav>
  );
}
