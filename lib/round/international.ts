import { matchRegion } from "@/lib/round/regions";
import type { RoundMatch } from "@/lib/round/types";

/**
 * A janela e o recorte do time Internacional (`.claude/plans/10-time-por-regiao.md`,
 * decisões 2 e 3): uma lista de partidas responde as duas perguntas que a
 * aba precisa — "ela existe agora?" e "quem pode ser contratado?" — mesmo
 * princípio de `matchesInRegion` (`lib/round/regions.ts`).
 */

/** Um dia recém-encerrado ainda conta como "há torneio" — sem oscilar entre uma partida e a próxima do mesmo Masters. */
export const INTERNATIONAL_LOOKBACK_DAYS = 14;

/** O quanto à frente vale anunciar a aba, para quem já quer montar o time antes do primeiro jogo. */
export const INTERNATIONAL_LOOKAHEAD_DAYS = 45;

/** As partidas de Masters/Champions dentro da lista — `matchRegion(...) === "international"`. */
export function internationalMatches(
  matches: readonly RoundMatch[],
): RoundMatch[] {
  return matches.filter((match) => matchRegion(match) === "international");
}

/** Há Masters/Champions no calendário agora? A aba Internacional só existe quando isto é `true`. */
export function hasInternationalEvent(matches: readonly RoundMatch[]): boolean {
  return internationalMatches(matches).length > 0;
}

/**
 * As organizações classificadas para o torneio internacional — dedup dos
 * dois lados de toda partida internacional na lista. É o escopo do mercado
 * do time Internacional (`MarketScope`), não `player.region`.
 */
export function qualifiedOrganizations(
  matches: readonly RoundMatch[],
): string[] {
  const organizations = new Set<string>();
  for (const match of internationalMatches(matches)) {
    organizations.add(match.teamA);
    organizations.add(match.teamB);
  }
  return [...organizations];
}
