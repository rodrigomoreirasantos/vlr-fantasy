import type { RankedStanding, StandingRow } from "@/lib/championship/types";

/**
 * Ordena as linhas de classificação e atribui posição — a única fonte de
 * verdade da regra de ranking, sem tocar banco nem React. `getStandingRows`
 * (queries.ts) devolve as linhas sem ordem garantida; se a base de pontuação
 * mudar no futuro (ex. snapshot por rodada), só a query muda — esta função
 * e a UI que a consome ficam intactas.
 *
 * Empate: mesma pontuação desempata por nome (pt-BR) só para a ordem da
 * lista, mas os empatados dividem a mesma posição — "competition ranking"
 * (1, 2, 2, 4), nunca (1, 2, 3, 4).
 */
export function rankStandings(
  rows: readonly StandingRow[],
  currentUserId: string,
): RankedStanding[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.userName.localeCompare(b.userName, "pt-BR");
  });

  let lastPosition = 0;
  let lastPoints: number | null = null;

  return sorted.map((row, index) => {
    // Mesma pontuação do anterior → herda a posição (grupo de empate);
    // caso contrário, a posição é o índice na lista ordenada (1-based).
    const position = row.points === lastPoints ? lastPosition : index + 1;
    lastPosition = position;
    lastPoints = row.points;

    return { ...row, position, isCurrentUser: row.userId === currentUserId };
  });
}

/** Quantas vagas a faixa de classificação destaca — o pódio de sempre. */
export const PODIUM_SIZE = 3;

export type StandingZone = "leader" | "podium" | null;

/**
 * A faixa de uma linha da tabela. `total <= PODIUM_SIZE` devolve `null` para
 * todo mundo: num campeonato de 3, destacar os 3 não distingue ninguém.
 * Empate herda a posição (`rankStandings`), então dois segundos lugares ficam
 * os dois na faixa — que é o comportamento de tabela de liga de verdade.
 */
export function standingZone(position: number, total: number): StandingZone {
  if (total <= PODIUM_SIZE) return null;
  if (position === 1) return "leader";
  return position <= PODIUM_SIZE ? "podium" : null;
}
