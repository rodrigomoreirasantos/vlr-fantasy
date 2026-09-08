import type { PlayerRole } from "@/lib/team/types";

/** Estados possíveis de uma partida do calendário oficial. */
export const MATCH_STATUSES = ["upcoming", "live", "finished"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** Uma partida do calendário, ligada à rodada. */
export type RoundMatch = {
  id: string;
  teamA: string;
  teamB: string;
  event: string;
  scheduledAt: Date;
  status: MatchStatus;
  scoreA: number | null;
  scoreB: number | null;
  /**
   * A bandeira que o vlr põe no card do evento (`vlr_event.region`, um código
   * de duas letras). Reforça a região quando o nome do campeonato não a
   * revela — "THE POKAL 2026" não diz EMEA, a bandeira alemã diz. Opcional
   * porque nem toda origem de `RoundMatch` a carrega.
   */
  regionCode?: string | null;
};

/** Uma das cinco vagas congeladas em `round_roster` no fechamento da rodada. */
export type RoundRosterEntry = {
  position: number;
  player: { id: string; nickname: string; team: string } | null;
  captain: boolean;
  /** Pontos brutos do jogador — o ×2 do capitão é aplicado por `teamPoints`. */
  points: number;
  priceCents: number;
};

/** Um jogador do jogo (não só do time do usuário) e sua pontuação na rodada. */
export type RoundScorer = {
  playerId: string;
  nickname: string;
  team: string;
  role: PlayerRole;
  points: number;
};

/**
 * A pontuação parcial de um jogador na rodada **em andamento**, somada
 * direto de `player_match_stat`. É o que existe antes do fechamento — os
 * snapshots de `round_player_score` só nascem em `closeActiveRound`.
 */
export type LiveRoundScore = {
  playerId: string;
  nickname: string;
  team: string;
  role: PlayerRole;
  /** Soma dos pontos dos mapas já extraídos. */
  points: number;
  /** Preço atual, base da projeção de valorização. */
  priceCents: number;
  gamesPlayed: number;
  /** O campeonato em que ele jogou a rodada — de onde sai a região. */
  event: string | null;
};

/** Um jogador que valorizou ou desvalorizou na rodada. */
export type PriceMover = {
  playerId: string;
  nickname: string;
  team: string;
  role: PlayerRole;
  priceDeltaCents: number;
};

/** Uma linha de `round_team_result` — o resultado de um time numa rodada fechada. */
export type RoundTeamResult = {
  /** Já com o multiplicador de capitão aplicado. */
  points: number;
  balanceCents: number;
  /** Soma dos preços das 5 vagas antes da repreçificação. */
  squadValueCents: number;
};
