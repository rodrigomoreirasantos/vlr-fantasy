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
