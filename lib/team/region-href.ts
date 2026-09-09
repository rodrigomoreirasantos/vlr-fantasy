import type { TeamRegion } from "@/lib/round/regions";
import { REGION_PARAM } from "@/lib/team/region-constants";

/**
 * Os dois formatos de query que os chamadores têm em mãos: o `searchParams`
 * de uma página (Server Component) e o `useSearchParams()` do cliente
 * (`ReadonlyURLSearchParams`, que estende `URLSearchParams`).
 */
export type RegionHrefParams =
  URLSearchParams | Record<string, string | string[] | undefined>;

/**
 * `{rota}?…&region=<região>` preservando os demais parâmetros — a regra de
 * "troca só a região" que `<RegionTabs>` e `<RegionSwitcher>` (header)
 * compartilham. `region` sempre entra por último, para o href ficar estável
 * (`?c=abc&region=emea`) entre os dois lugares que a montam.
 */
export function regionHref(
  pathname: string,
  region: TeamRegion,
  params?: RegionHrefParams,
): string {
  const query = new URLSearchParams();

  const entries: [string, string][] =
    params instanceof URLSearchParams
      ? [...params.entries()]
      : Object.entries(params ?? {}).flatMap(([key, value]) =>
          value === undefined
            ? []
            : (Array.isArray(value) ? value : [value]).map(
                (item): [string, string] => [key, item],
              ),
        );

  for (const [key, value] of entries) {
    if (key === REGION_PARAM) continue;
    query.append(key, value);
  }
  query.set(REGION_PARAM, region);

  return `${pathname}?${query.toString()}`;
}
