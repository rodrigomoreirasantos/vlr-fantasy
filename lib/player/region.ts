import type { LeagueRegion, PlayerRegion } from "@/lib/round/regions";

/**
 * A cascata de resolução da região de um jogador
 * (`.claude/plans/10-time-por-regiao.md`, decisão 1): liga própria → liga da
 * organização → `"other"`. Puro — sem banco, sem React — para ser testável
 * em milissegundos; `lib/vlr/persist/player-regions.ts` é quem chama isto
 * dentro de uma transação.
 */

/** Uma aparição **de liga** de um jogador — já filtrada por `isLeagueRegion`. */
export type RegionalAppearance = {
  region: LeagueRegion;
  /** O instante do evento — decide quem é "mais recente". */
  at: Date;
};

/** Uma partida com as duas organizações, para o degrau 2 da cascata. */
export type OrgMatch = {
  teamA: string;
  teamB: string;
  region: LeagueRegion;
  at: Date;
};

/**
 * A liga da aparição mais recente. `null` se a lista estiver vazia (jogador
 * sem nenhuma partida de liga própria — vai para o degrau 2).
 *
 * Empate de instante é resolvido de forma determinística: a última da lista
 * na ordem em que ela chegou vence, então quem chama decide o desempate
 * ordenando a entrada (`listPlayerLeagueAppearances` ordena por `at` asc).
 */
export function latestLeagueAppearance(
  appearances: readonly RegionalAppearance[],
): { region: LeagueRegion; at: Date } | null {
  let latest: { region: LeagueRegion; at: Date } | null = null;
  for (const appearance of appearances) {
    if (!latest || appearance.at.getTime() >= latest.at.getTime()) {
      latest = { region: appearance.region, at: appearance.at };
    }
  }
  return latest;
}

/**
 * Organização → liga, pela partida de liga mais recente **daquela
 * organização** (qualquer um dos dois lados). É o degrau 2 da cascata: a
 * organização de um jogador sem histórico próprio empresta a liga dela.
 */
export function organizationRegions(
  matches: readonly OrgMatch[],
): Map<string, LeagueRegion> {
  const latestAt = new Map<string, number>();
  const result = new Map<string, LeagueRegion>();

  for (const match of matches) {
    const at = match.at.getTime();
    for (const team of [match.teamA, match.teamB]) {
      const current = latestAt.get(team);
      if (current === undefined || at >= current) {
        latestAt.set(team, at);
        result.set(team, match.region);
      }
    }
  }

  return result;
}

export type ResolvedPlayerRegion = {
  region: PlayerRegion;
  /**
   * Não-nulo **só** quando a região veio de partida do próprio jogador —
   * distingue "resolvida" de "provisória" (emprestada da organização).
   * `applyMatchPlayerRegions` usa isto para nunca deixar uma partida de liga
   * própria ser sobrescrita por uma dedução de organização.
   */
  sourceAt: Date | null;
};

/**
 * A cascata completa: liga própria (a mais recente) → liga da organização →
 * `"other"`. `own` já deve vir filtrada para aparições de liga
 * (`isLeagueRegion`) — um evento internacional ou desconhecido nunca derruba
 * quem tem liga própria no histórico.
 */
export function resolvePlayerRegion(input: {
  own: readonly RegionalAppearance[];
  organization: LeagueRegion | null;
}): ResolvedPlayerRegion {
  const own = latestLeagueAppearance(input.own);
  if (own) return { region: own.region, sourceAt: own.at };

  if (input.organization) return { region: input.organization, sourceAt: null };

  return { region: "other", sourceAt: null };
}
