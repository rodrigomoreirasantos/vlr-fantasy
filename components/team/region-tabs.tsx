import Link from "next/link";

import { chipClasses } from "@/components/home/chip-classes";
import { regionHref } from "@/lib/team/region-href";
import { regionColor, regionLabel, type TeamRegion } from "@/lib/round/regions";

export type RegionTabsProps = {
  current: TeamRegion;
  /** As regiões que a UI pode oferecer agora — 5 com torneio internacional, 4 sem (`resolveRegion`). */
  available: readonly TeamRegion[];
  /** Rota das abas — `/my-team` por padrão, `/ranking` na tela de campeonatos. */
  pathname?: string;
  /**
   * Os `searchParams` da página, para o link trocar **só** a região e
   * preservar o resto da query. Hoje `/my-team` não tem outro parâmetro, mas
   * um href montado do zero perde silenciosamente o primeiro que aparecer.
   * O Ranking não passa isto: levar o `c` de uma aba para outra abriria o
   * campeonato errado (ver `lib/championship/regions.ts`).
   */
  params?: Record<string, string | string[] | undefined>;
};

/**
 * A troca de time por região (`.claude/plans/10-time-por-regiao.md`,
 * decisão 8) — `<Link>`, não botão: é navegação de verdade, via
 * `?region=`, que o `proxy.ts` intercepta para gravar o cookie. URL
 * compartilhável, back/forward funcionam, e a troca sobrevive sem JS.
 *
 * `prefetch={false}`: prefetchar as cinco abas puxaria cinco páginas
 * dinâmicas (elenco + mercado inteiro de cada região) só por passar o mouse.
 * O `proxy.ts` já ignora requisições de prefetch para o cookie não ser
 * reescrito por elas — isto aqui é a segunda trava, e economiza o trabalho.
 *
 * A aba Internacional some sozinha quando `available` não a inclui — nada é
 * apagado no banco, só a oferta some da tela (ver `resolveRegion`).
 */
export function RegionTabs({
  current,
  available,
  pathname = "/my-team",
  params,
}: RegionTabsProps) {
  return (
    <nav aria-label="Região" className="mb-6 flex flex-wrap items-center gap-2">
      {available.map((region) => {
        const active = region === current;
        return (
          <Link
            key={region}
            href={regionHref(pathname, region, params)}
            prefetch={false}
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
