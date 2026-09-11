import type { RankedStanding } from "@/lib/championship/types";
import type {
  HomeSummary,
  RegionalPriceMover,
  RegionalScorer,
  RoundHighlights,
} from "@/lib/home/types";
import { IDLE_REFRESH_MS, LIVE_REFRESH_MS } from "@/lib/market/window";
import { isSameDay } from "@/lib/round/day";
import type { EventRegion } from "@/lib/round/regions";
import { eventRegion, matchRegion } from "@/lib/round/regions";
import type {
  LiveRoundScore,
  PriceMover,
  RoundMatch,
  RoundScorer,
  RoundTeamResult,
} from "@/lib/round/types";
import { averagePoints, priceDeltaCents } from "@/lib/scoring/pricing";

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
 *
 * Devolve as listas **inteiras**: quem corta é `highlightsFor`, depois de
 * escolhida a região. Cortar aqui deixaria uma região inteira de fora só por
 * não ter ninguém entre os cinco maiores do circuito.
 */
export function projectRoundHighlights(scores: readonly LiveRoundScore[]): {
  scorers: RegionalScorer[];
  movers: RegionalPriceMover[];
} {
  const average = averagePoints(scores.map((score) => score.points));

  return {
    scorers: [...scores]
      .sort((a, b) => b.points - a.points)
      .map((score) => ({
        playerId: score.playerId,
        nickname: score.nickname,
        team: score.team,
        role: score.role,
        points: Math.round(score.points * 10) / 10,
        photoUrl: score.photoUrl,
        region: eventRegion(score.event ?? ""),
      })),
    movers: scores.map((score) => ({
      playerId: score.playerId,
      nickname: score.nickname,
      team: score.team,
      role: score.role,
      photoUrl: score.photoUrl,
      priceDeltaCents: priceDeltaCents({
        priceCents: score.priceCents,
        points: score.points,
        averagePoints: average,
        gamesPlayed: score.gamesPlayed,
      }),
      region: eventRegion(score.event ?? ""),
    })),
  };
}

/** Quantos destaques listar em cada lado (maiores altas / maiores quedas). */
export const PRICE_MOVER_LIMIT = 5;

/** Mantém, por região, as `limit` maiores linhas segundo `rank`. */
function topPerRegion<T extends { region: EventRegion }>(
  rows: readonly T[],
  limit: number,
  rank: (row: T) => number,
): T[] {
  const byRegion = new Map<EventRegion, T[]>();
  for (const row of [...rows].sort((a, b) => rank(b) - rank(a))) {
    const current = byRegion.get(row.region) ?? [];
    if (current.length < limit) {
      current.push(row);
      byRegion.set(row.region, current);
    }
  }
  return [...byRegion.values()].flat();
}

/**
 * Reduz os destaques ao que qualquer recorte pode chegar a mostrar.
 *
 * `highlightsFor` corta em `limit` por região — então guardar mais que `limit`
 * de cada região é carregar a rodada inteira (centenas de linhas) até o
 * cliente para exibir onze itens. Cortar **por região**, e não globalmente, é
 * o que preserva o motivo de a query ter perdido o `limit`: uma liga pequena
 * continua tendo os seus destaques mesmo sem ninguém entre os maiores do
 * circuito. E o "Todos" continua certo, porque o maior do circuito é
 * necessariamente o maior da região dele.
 */
export function trimHighlights(
  highlights: Pick<RoundHighlights, "scorers" | "movers">,
  limit: number,
): Pick<RoundHighlights, "scorers" | "movers"> {
  return {
    scorers: topPerRegion(highlights.scorers, limit, (row) => row.points),
    movers: [
      ...topPerRegion(
        highlights.movers.filter((row) => row.priceDeltaCents > 0),
        limit,
        (row) => row.priceDeltaCents,
      ),
      ...topPerRegion(
        highlights.movers.filter((row) => row.priceDeltaCents < 0),
        limit,
        (row) => -row.priceDeltaCents,
      ),
    ],
  };
}

/**
 * Os destaques já recortados para uma região (ou para o circuito inteiro,
 * quando `region` é `null`).
 *
 * O filtro de sinal é o mesmo de `getRoundPriceMovers`: delta zero não é
 * valorização, e sem ele o mesmo jogador apareceria nas duas listas.
 */
export function highlightsFor(
  highlights: RoundHighlights,
  region: EventRegion | null,
  limit: number,
): {
  topScorer: RoundScorer | null;
  risers: PriceMover[];
  fallers: PriceMover[];
} {
  const inRegion = <T extends { region: EventRegion }>(rows: readonly T[]) =>
    region === null ? [...rows] : rows.filter((row) => row.region === region);

  const scorers = inRegion(highlights.scorers).sort(
    (a, b) => b.points - a.points,
  );
  const movers = inRegion(highlights.movers);

  return {
    topScorer: scorers[0] ?? null,
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

/**
 * As regiões que **ainda jogam hoje** — as únicas cujos destaques ficam
 * escondidos.
 *
 * A regra vem do prompt e é de produto, não de dado: enquanto a liga ainda
 * joga naquele dia, anunciar o maior pontuador é entregar o resultado de uma
 * partida em andamento para quem ainda vai assisti-la.
 *
 * **Devolve o que esconder, não o que mostrar**, e a diferença importa: a
 * lista de partidas que chega aqui é a janela de trava
 * (`listMarketLockMatches`, ontem → +7d, só de eventos seguidos). Uma versão
 * que devolvesse "as reveladas" só saberia revelar regiões presentes nessa
 * janela, e esconderia para sempre os destaques de uma liga em intervalo entre
 * stages — ou de quem pontuou numa rodada sem partida rastreada. Esconder é a
 * exceção; ela precisa ser afirmada por um jogo de hoje que ainda não acabou.
 *
 * O dia vem de `lib/round/day.ts`, com fuso explícito — o mesmo recorte que
 * `marketGroupKey` (`lib/market/window.ts`) usa para fechar o mercado. As duas
 * regras falam do "dia de jogo" e não podem discordar sobre onde ele começa.
 */
export function pendingRegions(
  matches: readonly RoundMatch[],
  now: Date = new Date(),
): EventRegion[] {
  const pending = new Set<EventRegion>();

  for (const match of matches) {
    if (match.status !== "finished" && isSameDay(match.scheduledAt, now)) {
      pending.add(matchRegion(match));
    }
  }

  return [...pending];
}

// `LIVE_REFRESH_MS`/`IDLE_REFRESH_MS` moram em `lib/market/window.ts` — é lá
// que `myTeamRefreshMs` (o mesmo ritmo, para a `/my-team`) também vive.
// Reexportadas daqui para não quebrar quem já importa os dois nomes da Home.
export { IDLE_REFRESH_MS, LIVE_REFRESH_MS };

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
