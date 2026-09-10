import { TEAM_REGIONS, type TeamRegion } from "@/lib/round/regions";
import type { ChampionshipSummary } from "@/lib/championship/types";

/**
 * A região efetiva da tela de Ranking, em ordem de prioridade:
 * 1. a região do campeonato pedido por `?c=` — os links de /home e /perfil
 *    apontam para `/ranking?c=<id>` sem região, e não podem cair numa aba vazia;
 * 2. o `?region=` explícito (o usuário clicou a aba) — respeitado mesmo vazio,
 *    senão clicar na aba não faria nada;
 * 3. a região resolvida (cookie/header), se ela tiver campeonato;
 * 4. a primeira região com campeonato, na ordem de `TEAM_REGIONS`;
 * 5. a região resolvida, quando o usuário não tem campeonato nenhum.
 */
export function resolveRankingRegion(args: {
  championships: readonly ChampionshipSummary[];
  requested: ChampionshipSummary | undefined;
  explicit: TeamRegion | null;
  fallback: TeamRegion;
}): TeamRegion {
  const { championships, requested, explicit, fallback } = args;

  if (requested) return requested.region;
  if (explicit) return explicit;

  const hasChampionshipIn = (region: TeamRegion) =>
    championships.some((championship) => championship.region === region);

  if (hasChampionshipIn(fallback)) return fallback;

  const firstWithChampionship = TEAM_REGIONS.find(hasChampionshipIn);
  return firstWithChampionship ?? fallback;
}

/**
 * As abas a oferecer: as regiões que a UI aceita agora (`resolveRegion`, que
 * esconde "international" fora da janela do torneio) **mais** qualquer região
 * em que o usuário já tenha campeonato — um campeonato Internacional criado
 * antes do torneio não pode ficar inalcançável. Ordem de `TEAM_REGIONS`.
 */
export function rankingRegionTabs(
  championships: readonly ChampionshipSummary[],
  available: readonly TeamRegion[],
): readonly TeamRegion[] {
  const hasExtra = TEAM_REGIONS.some(
    (region) =>
      !available.includes(region) &&
      championships.some((championship) => championship.region === region),
  );
  if (!hasExtra) return available;

  return TEAM_REGIONS.filter(
    (region) =>
      available.includes(region) ||
      championships.some((championship) => championship.region === region),
  );
}
