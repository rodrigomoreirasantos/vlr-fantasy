import type {
  PlayerMatchPerformance,
  RosterMatchPlayer,
  RosterMatchRecap,
} from "@/lib/player/types";

/**
 * As regras puras da seção "Desempenho do seu time" — sem banco, sem React.
 * `lib/home/queries.ts` e os componentes de `components/home/` são os únicos
 * chamadores; cada função aqui é testável em milissegundos.
 */

/** As métricas que o gráfico sabe plotar. A ordem é a dos chips. */
export const FORM_METRICS = ["points", "acs", "rating", "kills", "kd"] as const;

export type FormMetric = (typeof FORM_METRICS)[number];

const METRIC_LABELS: Readonly<Record<FormMetric, string>> = {
  points: "Pontos",
  acs: "ACS",
  rating: "Rating",
  kills: "Abates",
  kd: "K/D",
};

export function metricLabel(metric: FormMetric): string {
  return METRIC_LABELS[metric];
}

/** Casas decimais de cada métrica — `points` e `kd` são fracionários, abates não. */
const METRIC_PRECISION: Readonly<Record<FormMetric, number>> = {
  points: 1,
  acs: 0,
  rating: 2,
  kills: 0,
  kd: 2,
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * O valor de uma métrica numa partida. `null` — e nunca `NaN` — quando o
 * scoreboard do vlr não trouxe o número: o gráfico precisa saber a diferença
 * entre "zerou" e "não temos o dado".
 *
 * `kd` com zero mortes não é infinito: sem morrer, a razão é o próprio número
 * de abates, que é como todo site de stats de Valorant apresenta.
 */
export function metricValue(
  performance: PlayerMatchPerformance,
  metric: FormMetric,
): number | null {
  switch (metric) {
    case "points":
      return round(performance.points, METRIC_PRECISION.points);
    case "acs":
      return performance.acs === null
        ? null
        : round(performance.acs, METRIC_PRECISION.acs);
    case "rating":
      return performance.rating === null
        ? null
        : round(performance.rating, METRIC_PRECISION.rating);
    case "kills":
      return performance.kills;
    case "kd": {
      const { kills, deaths } = performance;
      if (kills === null || deaths === null) return null;
      return round(deaths === 0 ? kills : kills / deaths, METRIC_PRECISION.kd);
    }
  }
}

/**
 * As `size` partidas mais recentes **de cada jogador**, em ordem cronológica
 * (da mais antiga para a mais recente — a ordem em que o gráfico as desenha).
 *
 * Cortar por jogador, e não na lista inteira, é o ponto: um jogador de uma liga
 * que jogou três vezes na semana consumiria a janela toda e apagaria do gráfico
 * quem joga uma vez.
 */
export function lastMatchesPerPlayer(
  rows: readonly PlayerMatchPerformance[],
  size: number,
): Map<string, PlayerMatchPerformance[]> {
  const byPlayer = new Map<string, PlayerMatchPerformance[]>();

  for (const row of rows) {
    const current = byPlayer.get(row.playerId) ?? [];
    current.push(row);
    byPlayer.set(row.playerId, current);
  }

  for (const [playerId, matches] of byPlayer) {
    const chronological = [...matches].sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
    );
    byPlayer.set(playerId, chronological.slice(-size));
  }

  return byPlayer;
}

/**
 * Contra quem ele jogou. Sem lado resolvido (jogador que mudou de time), o
 * confronto inteiro é a resposta honesta — melhor que apontar o adversário
 * errado.
 */
function opponentOf(performance: PlayerMatchPerformance): string {
  const side = sideOf(performance);
  if (side === "A") return performance.teamB;
  if (side === "B") return performance.teamA;
  return `${performance.teamA} x ${performance.teamB}`;
}

/** Um ponto do gráfico: o rótulo do eixo X e um valor por jogador (a chave é o `playerId`). */
export type FormPoint = {
  label: string;
  /** Índice a partir de 1 — o eixo X é "quantos jogos atrás", não uma data. */
  index: number;
  values: Record<string, number | null>;
  /** Qual partida foi, por jogador — é o que o tooltip mostra. */
  matches: Record<string, { opponent: string; scheduledAt: Date }>;
};

export type FormSeries = {
  playerId: string;
  nickname: string;
};

/**
 * Os dados do gráfico de linhas, **alinhados por recência**.
 *
 * Jogadores de ligas diferentes jogam em dias diferentes: um eixo de datas
 * produziria cinco linhas tracejadas que nunca se cruzam e um gráfico que não
 * compara nada. Alinhar por "quantos jogos atrás" é o que transforma isto numa
 * leitura de forma — e o tooltip diz, ponto a ponto, qual partida foi.
 *
 * Quem jogou menos que a janela entra alinhado **à direita**: o último ponto de
 * todo mundo é o jogo mais recente de cada um, e quem tem menos histórico deixa
 * buraco no começo, não no fim.
 */
export function buildFormSeries(
  rows: readonly PlayerMatchPerformance[],
  metric: FormMetric,
  size: number,
): { points: FormPoint[]; series: FormSeries[] } {
  const byPlayer = lastMatchesPerPlayer(rows, size);
  if (byPlayer.size === 0) return { points: [], series: [] };

  const series: FormSeries[] = [...byPlayer.entries()]
    .map(([playerId, matches]) => ({
      playerId,
      nickname: matches[matches.length - 1]!.nickname,
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "pt-BR"));

  const width = Math.max(...[...byPlayer.values()].map((m) => m.length));

  const points: FormPoint[] = [];
  for (let column = 0; column < width; column += 1) {
    // Distância até o último jogo: 0 é o mais recente, e é a coluna da direita.
    const fromEnd = width - 1 - column;

    const values: Record<string, number | null> = {};
    const matches: Record<string, { opponent: string; scheduledAt: Date }> = {};

    for (const { playerId } of series) {
      const played = byPlayer.get(playerId)!;
      const performance = played[played.length - 1 - fromEnd];

      values[playerId] = performance ? metricValue(performance, metric) : null;
      if (performance) {
        matches[playerId] = {
          opponent: opponentOf(performance),
          scheduledAt: performance.scheduledAt,
        };
      }
    }

    points.push({
      index: column + 1,
      label: fromEnd === 0 ? "Último" : `J-${fromEnd}`,
      values,
      matches,
    });
  }

  return { points, series };
}

/**
 * De que lado do placar um jogador estava, por igualdade de texto entre
 * `player.team` e `match.teamA/teamB` — o cruzamento que `db/schema/matches.ts`
 * documenta.
 *
 * `null` quando não casa com nenhum dos dois, e isso acontece de verdade: um
 * jogador que trocou de organização carrega o time **atual**, enquanto a
 * partida guarda o de então. Chutar "A" nesse caso não erra só o rótulo —
 * `wonSeries` deriva vitória/derrota daqui, então um jogador que perdeu
 * apareceria como vencedor no resumo.
 */
function sideOf(performance: PlayerMatchPerformance): "A" | "B" | null {
  if (performance.team === performance.teamA) return "A";
  if (performance.team === performance.teamB) return "B";
  return null;
}

/** Venceu a série? `null` sem placar ou sem lado — ausência de dado, não derrota. */
function wonSeries(performance: PlayerMatchPerformance): boolean | null {
  const { scoreA, scoreB } = performance;
  if (scoreA === null || scoreB === null) return null;

  const side = sideOf(performance);
  if (side === null) return null;

  return side === "A" ? scoreA > scoreB : scoreB > scoreA;
}

/**
 * Uma entrada por **partida**, da mais recente para a mais antiga.
 *
 * Agrupar por `matchId` é a resposta literal ao requisito: dois dos seus 5 em
 * lados opostos do mesmo jogo caem na mesma entrada, com um placar só e os dois
 * nomes — em vez de dois cartões repetindo o mesmo resultado.
 */
export function groupPerformancesByMatch(
  rows: readonly PlayerMatchPerformance[],
): RosterMatchRecap[] {
  const byMatch = new Map<string, RosterMatchRecap>();

  for (const row of rows) {
    const player: RosterMatchPlayer = {
      playerId: row.playerId,
      nickname: row.nickname,
      team: row.team,
      side: sideOf(row),
      points: row.points,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      acs: row.acs,
      rating: row.rating,
      mapsWon: row.mapsWon,
      mapsPlayed: row.mapsPlayed,
      won: wonSeries(row),
    };

    const existing = byMatch.get(row.matchId);
    if (existing) {
      existing.players.push(player);
      continue;
    }

    byMatch.set(row.matchId, {
      matchId: row.matchId,
      event: row.event,
      scheduledAt: row.scheduledAt,
      teamA: row.teamA,
      teamB: row.teamB,
      scoreA: row.scoreA,
      scoreB: row.scoreB,
      status: row.status,
      players: [player],
    });
  }

  const recaps = [...byMatch.values()];
  for (const recap of recaps) {
    recap.players.sort((a, b) => b.points - a.points);
  }

  return recaps.sort(
    (a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime(),
  );
}

/** Plural em pt-BR sem uma dependência de i18n para duas palavras. */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * O resumo em uma frase do que aconteceu com os seus: quantos jogaram, o saldo
 * de vitórias, os pontos somados e quem foi melhor.
 *
 * `null` sem partida nenhuma — a frase não é o lugar de dizer que não houve
 * jogo; o estado vazio do painel é.
 */
export function summarizeRosterRound(
  recaps: readonly RosterMatchRecap[],
  rosterSize: number,
): string | null {
  const players = recaps.flatMap((recap) => recap.players);
  if (players.length === 0) return null;

  const played = new Set(players.map((player) => player.playerId)).size;

  // Vitórias e derrotas se contam por **lado numa partida**, não por jogador:
  // três companheiros de time vencendo juntos é uma vitória, não três. E dois
  // dos seus em lados opostos é, corretamente, uma vitória e uma derrota.
  const sides = new Map<string, boolean | null>();
  for (const recap of recaps) {
    for (const player of recap.players) {
      // Sem lado resolvido, cada jogador é a sua própria chave: não dá para
      // fundi-lo com um companheiro que não sabemos se ele tinha.
      const key = player.side ?? `?${player.playerId}`;
      sides.set(`${recap.matchId}@${key}`, player.won);
    }
  }
  const outcomes = [...sides.values()];
  const wins = outcomes.filter((won) => won === true).length;
  const losses = outcomes.filter((won) => won === false).length;

  const points = round(
    players.reduce((total, player) => total + player.points, 0),
    1,
  );
  const best = players.reduce((top, player) =>
    player.points > top.points ? player : top,
  );

  const record: string[] = [];
  if (wins > 0) record.push(plural(wins, "vitória", "vitórias"));
  if (losses > 0) record.push(plural(losses, "derrota", "derrotas"));

  const head = `${played} dos seus ${rosterSize} ${played === 1 ? "jogou" : "jogaram"}`;
  const middle = record.length > 0 ? `${record.join(" e ")}, ` : "";

  return `${head}: ${middle}${points.toFixed(1)} pontos somados. Melhor: ${best.nickname} (${best.points.toFixed(1)}).`;
}
