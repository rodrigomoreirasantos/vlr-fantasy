import type { MatchStatus } from "@/lib/round/types";

/**
 * O que um jogador fez em **uma série** — a soma (e a média, onde somar não faz
 * sentido) dos mapas daquela partida.
 *
 * `player_match_stat` guarda uma linha por mapa (`db/schema/player-match-stats.ts`),
 * e é assim que tem que ser: a série é uma agregação, não um dado. Este tipo é
 * essa agregação já resolvida no banco — a granularidade em que o usuário lê o
 * calendário ("o jogo de ontem"), e não a em que o vlr publica os números.
 */
export type PlayerMatchPerformance = {
  playerId: string;
  nickname: string;
  /** Organização do jogador, ex. "LOUD" — cruza com `teamA`/`teamB` por igualdade de texto. */
  team: string;

  matchId: string;
  event: string;
  scheduledAt: Date;
  teamA: string;
  teamB: string;
  /** Placar da série em mapas. `null` enquanto a partida não terminou. */
  scoreA: number | null;
  scoreB: number | null;
  status: MatchStatus;

  /** Soma dos `fantasyPoints` dos mapas — o número que move o saldo. */
  points: number;
  /**
   * Somas e médias dos mapas. Todas `null` quando o scoreboard do vlr não
   * trouxe o número em mapa nenhum — "não temos o dado" não é "zerou".
   */
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  acs: number | null;
  rating: number | null;
  mapsWon: number;
  mapsPlayed: number;
};

/** Um dos seus jogadores dentro de uma partida — a linha dele no placar. */
export type RosterMatchPlayer = {
  playerId: string;
  nickname: string;
  team: string;
  /**
   * De que lado do placar ele estava. Decide qual número é "o dele".
   * `null` quando `player.team` não casa com nenhum dos dois lados — um
   * jogador que trocou de organização depois da partida.
   */
  side: "A" | "B" | null;
  points: number;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  acs: number | null;
  rating: number | null;
  /** Mapas vencidos / disputados por ele naquela série. */
  mapsWon: number;
  mapsPlayed: number;
  /** Venceu a série. `null` enquanto não há placar. */
  won: boolean | null;
};

/**
 * Uma partida em que **algum** dos seus 5 jogou.
 *
 * A chave é `matchId`: dois jogadores seus em lados opostos do mesmo jogo
 * produzem **uma** entrada com dois nomes, nunca dois placares iguais — é o que
 * o prompt pede, e cai de graça do agrupamento.
 */
export type RosterMatchRecap = {
  matchId: string;
  event: string;
  scheduledAt: Date;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  status: MatchStatus;
  /** Os seus naquele jogo, do que mais pontuou para o que menos pontuou. */
  players: RosterMatchPlayer[];
};
