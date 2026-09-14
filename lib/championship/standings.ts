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

export type PodiumPlace = 1 | 2 | 3;

export type PodiumEntry = {
  place: PodiumPlace;
  /** Quem representa a posição — o primeiro do grupo na ordem da lista. */
  standing: RankedStanding;
  /** Quantos outros dividem a mesma posição (e seguem na lista abaixo). */
  tiedCount: number;
};

/**
 * Separa a classificação em pódio e lista. O pódio mostra **um** time por
 * posição (1º, 2º, 3º que existirem); os empatados com ele não somem — vão
 * para a lista, na posição que dividem, e o pódio avisa "+N empatados". Sem
 * isso, um empate largo (todo mundo com 0 no começo da rodada) virava uma
 * coluna com o campeonato inteiro empilhado.
 *
 * Todo mundo empatado (2+ membros): não há pódio — ninguém se destaca, então
 * a lista mostra todos. Um membro só ainda ganha o pódio.
 */
export function splitPodium(standings: readonly RankedStanding[]): {
  podium: PodiumEntry[];
  rest: RankedStanding[];
} {
  const allTied =
    standings.length > 1 && standings.every((row) => row.position === 1);
  if (allTied) return { podium: [], rest: [...standings] };

  const podium: PodiumEntry[] = [];
  for (const place of [1, 2, 3] as const) {
    const group = standings.filter((row) => row.position === place);
    if (group.length === 0) continue;
    podium.push({ place, standing: group[0], tiedCount: group.length - 1 });
  }

  const onPodium = new Set(podium.map((entry) => entry.standing.userId));
  return {
    podium,
    rest: standings.filter((row) => !onPodium.has(row.userId)),
  };
}

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
