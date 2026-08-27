export type ChampionshipSummary = {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
};

/**
 * Uma linha de classificação sem posição atribuída — a query devolve isto
 * sem ordem garantida; `rankStandings` (standings.ts) é quem ordena e
 * atribui posição.
 */
export type StandingRow = {
  userId: string;
  userName: string;
  username: string | null;
  teamName: string;
  /** Soma da pontuação atual do elenco (`player.score`) das 5 vagas. */
  points: number;
};

export type RankedStanding = StandingRow & {
  /** Posição compartilhada em caso de empate (competition ranking: 1, 2, 2, 4). */
  position: number;
  isCurrentUser: boolean;
};

export type PendingInvite = {
  memberId: string;
  championshipId: string;
  championshipName: string;
  invitedByUsername: string | null;
  invitedAt: Date;
};

export type PendingMember = {
  memberId: string;
  userName: string;
  username: string | null;
};
