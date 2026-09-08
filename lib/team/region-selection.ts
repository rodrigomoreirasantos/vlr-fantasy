import { cookies, headers } from "next/headers";

import { REGION_COOKIE, REGION_HEADER } from "@/lib/team/region-constants";
import { getInternationalWindow } from "@/lib/team/queries";
import {
  DEFAULT_TEAM_REGION,
  LEAGUE_REGIONS,
  parseTeamRegion,
  TEAM_REGIONS,
  type TeamRegion,
} from "@/lib/round/regions";

export {
  REGION_COOKIE,
  REGION_HEADER,
  REGION_PARAM,
} from "@/lib/team/region-constants";

/**
 * O estado da região selecionada na escalação (`.claude/plans/10-time-por-regiao.md`,
 * decisão 8): `?region=` na URL de `/my-team` + cookie para o header e a
 * Home lembrarem a última escolha. Server-only — usa `next/headers`.
 */

export type RegionSelection = {
  region: TeamRegion;
  /** As regiões que a UI pode oferecer agora — 5 com torneio internacional, 4 sem. */
  available: readonly TeamRegion[];
};

/**
 * Resolve a região desta requisição. Ordem: `requested` (o `?region=` da
 * própria página) → header do proxy → cookie → default. Depois **clampa**:
 * `"international"` sem torneio ativo cai no default — a aba não existe
 * agora, então nenhum estado guardado pode apontar para ela.
 */
export async function resolveRegion(
  requested?: string | readonly string[],
): Promise<RegionSelection> {
  const fromParam = parseTeamRegion(
    Array.isArray(requested) ? requested[0] : requested,
  );
  const fromHeader =
    fromParam ?? parseTeamRegion((await headers()).get(REGION_HEADER));
  const fromCookie =
    fromHeader ?? parseTeamRegion((await cookies()).get(REGION_COOKIE)?.value);
  const region = fromCookie ?? DEFAULT_TEAM_REGION;

  const { open } = await getInternationalWindow();
  const available = open ? TEAM_REGIONS : LEAGUE_REGIONS;

  if (region === "international" && !open) {
    return { region: DEFAULT_TEAM_REGION, available };
  }
  return { region, available };
}
