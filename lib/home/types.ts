import type { ChampionshipPlacement } from "@/components/profile/championship-placements";
import type { PendingInvite } from "@/lib/championship/types";
import type { PriceMover, RoundMatch, RoundScorer } from "@/lib/round/types";

/** O que aconteceu na última rodada fechada. */
export type RoundRecap = {
  roundNumber: number;
  /** Pontos do time, já com o multiplicador de capitão. */
  points: number;
  patrimonyCents: number;
  /** `null` quando não há rodada anterior para comparar. */
  patrimonyDeltaCents: number | null;
  /** Reaproveita o tipo de `components/profile/championship-placements.tsx`. */
  placements: ChampionshipPlacement[];
};

/**
 * A sua rodada corrente: quando o mercado fecha, jogo a jogo. Mesma lista de
 * "Próximos jogos", com outro relógio — o do fechamento, não o do kickoff.
 *
 * O estado dos jogadores não entra: no Valorant competitivo não há boletim de
 * lesão nem escalação divulgada com antecedência, e um aviso que a fonte não
 * sabe dar é um aviso que a tela inventa.
 */
export type NextRoundBrief = {
  roundNumber: number;
  /** A janela inteira, não só o fechamento: o mercado pode ainda não ter aberto. */
  marketOpensAt: Date;
  marketClosesAt: Date;
  /**
   * A frase do estado do mercado (`formatMarketCountdown`), já formatada no
   * servidor para o primeiro paint do countdown no cliente.
   */
  marketCountdown: string;
  /**
   * As partidas ainda por vir da rodada, só de campeonato seguido. Cada uma
   * tem o seu fechamento — uma hora antes do kickoff —, e é isso que a tela
   * lista, com o mesmo filtro por campeonato de "Próximos jogos".
   */
  matches: RoundMatch[];
  /** Organizações dos seus 5 — destacam a partida deles na lista. */
  myOrganizations: readonly string[];
};

/**
 * Os próximos jogos **reais** do circuito, vindos do pipeline do vlr.gg
 * (`lib/vlr/`). Independente da rodada: o calendário do circuito segue
 * acontecendo mesmo que a rodada ativa do jogo seja outra, e é ele que
 * responde "o que vai acontecer agora".
 */
export type UpcomingMatches = {
  matches: RoundMatch[];
  /** Organizações dos seus 5 — destacam a partida deles na lista. */
  myOrganizations: readonly string[];
};

/** Os destaques do jogo inteiro na rodada — fechada ou em andamento. */
export type RoundHighlights = {
  roundNumber: number;
  /**
   * A rodada ainda está aberta: os números vêm de `player_match_stat` e
   * mudam a cada jogo encerrado, e as variações de preço são projeções.
   * `false` é o snapshot congelado de `round_player_score`.
   */
  partial: boolean;
  topScorer: RoundScorer | null;
  risers: PriceMover[];
  fallers: PriceMover[];
};

export type HomeSummary = {
  pendingInvites: PendingInvite[];
  /**
   * Já existe alguma rodada fechada no jogo? Distingue os dois motivos de
   * `recap` ser `null`: ninguém fechou rodada ainda, ou este time entrou
   * depois do fechamento (sem linha em `round_team_result`). Sem isso a Home
   * dizia "a primeira rodada ainda não foi fechada" ao lado de destaques
   * reais dessa mesma rodada.
   */
  hasFinishedRound: boolean;
  /** `null` quando o usuário não tem resultado na última rodada fechada. */
  recap: RoundRecap | null;
  /** `null` só no caso degenerado de não haver nenhuma rodada `upcoming`. */
  nextRound: NextRoundBrief | null;
  /** Calendário real do circuito — vazio enquanto o scrap não tiver rodado. */
  upcoming: UpcomingMatches;
  /** `null` só enquanto nenhuma partida da rodada em curso tiver sido pontuada. */
  highlights: RoundHighlights | null;
};
