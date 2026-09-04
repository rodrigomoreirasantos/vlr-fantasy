import type { RankedStanding } from "@/lib/championship/types";
import type {
  LiveRoundScore,
  PriceMover,
  RoundScorer,
  RoundTeamResult,
} from "@/lib/round/types";
import { averagePoints, priceDeltaCents } from "@/lib/scoring/pricing";
import type { HomeSummary } from "@/lib/home/types";

/**
 * Regras puras da Home — sem banco, sem React. `lib/home/queries.ts` é o
 * único chamador; cada função aqui é testável em milissegundos.
 */

/** Patrimônio: saldo + valor do elenco (`round_team_result`). */
export function patrimonyCents(result: RoundTeamResult): number {
  return result.balanceCents + result.squadValueCents;
}

/**
 * Variação de patrimônio em relação à rodada anterior. `null` sem rodada
 * anterior — a primeira rodada fechada não inventa variação.
 */
export function patrimonyDeltaCents(
  current: RoundTeamResult,
  previous: RoundTeamResult | null,
): number | null {
  if (!previous) return null;
  return patrimonyCents(current) - patrimonyCents(previous);
}

export type PlacementChange = {
  position: number;
  memberCount: number;
  /** `previousPosition - currentPosition`: positivo subiu, negativo desceu, `null` sem rodada anterior. */
  change: number | null;
};

/**
 * Posição do usuário na classificação atual, com a variação em relação à
 * classificação anterior. `null` quando o usuário não está na classificação
 * atual (não deveria acontecer para um campeonato do próprio usuário, mas a
 * função não assume). `change` fica `null` sem classificação anterior — o
 * usuário "estreou" no campeonato, ou é a primeira rodada fechada.
 */
export function placementChanges(
  current: readonly RankedStanding[],
  previous: readonly RankedStanding[] | null,
  userId: string,
): PlacementChange | null {
  const currentRow = current.find((row) => row.userId === userId);
  if (!currentRow) return null;

  const previousRow = previous?.find((row) => row.userId === userId) ?? null;

  return {
    position: currentRow.position,
    memberCount: current.length,
    change: previousRow ? previousRow.position - currentRow.position : null,
  };
}

/**
 * Os destaques da rodada **ainda aberta**, projetados a partir do que já foi
 * jogado. Existe porque o usuário não pode esperar o fechamento para saber
 * quem está indo bem: os jogos terminam ao longo da semana e a Home tem que
 * andar junto.
 *
 * A projeção de preço reusa `priceDeltaCents` — a mesma função que
 * `closeActiveRound` aplica de verdade — com a média **da rodada**, calculada
 * só sobre quem jogou (mesmo recorte do fechamento). Ela é uma previsão, não
 * uma promessa: enquanto faltar jogo, a média muda e o delta muda com ela. É
 * por isso que a tela rotula esses destaques como parciais.
 */
export function projectRoundHighlights(
  scores: readonly LiveRoundScore[],
  limit: number,
): {
  topScorer: RoundScorer | null;
  risers: PriceMover[];
  fallers: PriceMover[];
} {
  const average = averagePoints(scores.map((score) => score.points));

  const movers = scores.map((score) => ({
    playerId: score.playerId,
    nickname: score.nickname,
    team: score.team,
    role: score.role,
    priceDeltaCents: priceDeltaCents({
      priceCents: score.priceCents,
      points: score.points,
      averagePoints: average,
      gamesPlayed: score.gamesPlayed,
    }),
  }));

  const [topScorer] = [...scores]
    .sort((a, b) => b.points - a.points)
    .map((score) => ({
      playerId: score.playerId,
      nickname: score.nickname,
      team: score.team,
      role: score.role,
      points: Math.round(score.points * 10) / 10,
    }));

  return {
    topScorer: topScorer ?? null,
    // O mesmo filtro de sinal de `getRoundPriceMovers`: delta zero não é
    // valorização, e sem ele o mesmo jogador apareceria nas duas listas.
    risers: movers
      .filter((mover) => mover.priceDeltaCents > 0)
      .sort((a, b) => b.priceDeltaCents - a.priceDeltaCents)
      .slice(0, limit),
    fallers: movers
      .filter((mover) => mover.priceDeltaCents < 0)
      .sort((a, b) => a.priceDeltaCents - b.priceDeltaCents)
      .slice(0, limit),
  };
}

/** De quanto em quanto tempo a Home se atualiza sozinha, com jogo acontecendo. */
export const LIVE_REFRESH_MS = 60_000;

/** E quando não há nada em andamento — o calendário muda em horas, não em minutos. */
export const IDLE_REFRESH_MS = 5 * 60_000;

/**
 * O ritmo de atualização automática da Home (`<LiveRefresh>`).
 *
 * Não é um número fixo de propósito: cada ciclo é uma rodada de consultas por
 * usuário conectado, e só vale de minuto em minuto quando há placar mudando —
 * partida ao vivo ou rodada em curso já pontuando. Fora disso, o que a tela
 * mostra muda em horas, e insistir seria gastar banco para redesenhar a mesma
 * coisa.
 */
export function refreshIntervalMs(summary: HomeSummary): number {
  const hasLiveMatch = summary.upcoming.matches.some(
    (match) => match.status === "live",
  );
  const roundInProgress = summary.highlights?.partial === true;

  return hasLiveMatch || roundInProgress ? LIVE_REFRESH_MS : IDLE_REFRESH_MS;
}
