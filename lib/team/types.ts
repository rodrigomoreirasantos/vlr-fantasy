export type PlayerRole =
  | "Duelista"
  | "Iniciador"
  | "Controlador"
  | "Sentinela";

export type Player = {
  id: string;
  nickname: string;
  /** Organização do jogador na vida real, ex. "FNATIC". */
  team: string;
  agent: string;
  role: PlayerRole;
  /** Pontuação acumulada na rodada corrente. */
  score: number;
};

/**
 * Uma das cinco vagas da escalação. `player` é `null` enquanto o usuário não
 * escalou ninguém — o estado inicial de todo time novo.
 */
export type RosterSlot = {
  player: Player | null;
  captain: boolean;
};

export type TeamSummary = {
  name: string;
  /** Pontuação total do time na rodada. */
  points: number;
  /** Saldo em moeda virtual disponível para o mercado. */
  balance: number;
  scoredMatches: { played: number; total: number };
  market: {
    open: boolean;
    /**
     * Tempo restante já formatado, ex. "36h 12m".
     *
     * TODO: quando o mercado virar dado real, guardar a data de fechamento e
     * formatar com dayjs, conforme a regra de datas do CLAUDE.md.
     */
    closesIn: string;
  };
};
