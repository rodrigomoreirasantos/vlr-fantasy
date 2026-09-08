import type {
  LeagueRegion,
  PlayerRegion,
  TeamRegion,
} from "@/lib/round/regions";
import type { Player } from "@/lib/team/types";

/**
 * O recorte de mercado de um time regional (`.claude/plans/10-time-por-regiao.md`,
 * decisões 1 e 2). Puro — sem drizzle — porque é consumido tanto no servidor
 * (`getMarketByRole`) quanto no cliente (`MarketSheet`, dentro do
 * `SubstitutionContext`).
 *
 * ⚠️ Invariante frágil: o `WHERE` SQL de `getMarketByRole` (lib/team/queries.ts)
 * é outra implementação da mesma regra que `matchesScope` expressa aqui. As
 * duas precisam concordar sempre — mantidas lado a lado com comentário
 * cruzado, e testadas com os mesmos casos, porque a equivalência não é
 * testável sem banco.
 */
export type MarketScope =
  | { kind: "region"; region: LeagueRegion }
  | { kind: "organizations"; organizations: readonly string[] };

/**
 * O escopo de um time, a partir da sua região e — só quando ela é
 * `"international"` — das organizações classificadas para o torneio ativo
 * (`qualifiedOrganizations`, `lib/round/international.ts`).
 */
export function marketScopeFor(
  region: TeamRegion,
  qualified: readonly string[],
): MarketScope {
  if (region === "international") {
    return { kind: "organizations", organizations: qualified };
  }
  return { kind: "region", region };
}

/** O candidato pertence a este escopo? A mesma regra que `getMarketByRole` aplica no `WHERE`. */
export function matchesScope(
  scope: MarketScope,
  candidate: Pick<Player, "team" | "region">,
): boolean {
  if (scope.kind === "region") return candidate.region === scope.region;
  return scope.organizations.includes(candidate.team);
}

export type SlotWarning =
  { kind: "out-of-region"; region: PlayerRegion } | { kind: "not-qualified" };

/**
 * O selo de alerta para um jogador já escalado que não pertence mais ao
 * escopo do time (decisão 7: ele fica na vaga, nunca é vendido sozinho).
 * `null` quando ele está em casa.
 */
export function slotWarning(
  scope: MarketScope,
  player: Pick<Player, "team" | "region">,
): SlotWarning | null {
  if (matchesScope(scope, player)) return null;
  return scope.kind === "region"
    ? { kind: "out-of-region", region: player.region }
    : { kind: "not-qualified" };
}
