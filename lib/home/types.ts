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
 * Os próximos jogos **reais** do circuito, vindos do pipeline do vlr.gg
 * (`lib/vlr/`). Independente da rodada: o calendário do circuito segue
 * acontecendo mesmo que a rodada ativa do jogo seja outra, e é ele que
 * responde "o que vai acontecer agora".
 */
export type UpcomingMatches = {
  matches: RoundMatch[];
  /** Organizações dos seus 5 — destacam a partida deles na lista. */
  myOrganizations: readonly string[];
  /**
   * O próximo fechamento de mercado entre essas partidas — uma hora antes do
   * primeiro jogo do dia de algum campeonato (`nextMarketClose`). `null`
   * quando não há jogo marcado: sem jogo não há fechamento, e anunciar um
   * seria inventá-lo.
   */
  marketClosesAt: Date | null;
  /** A frase do fechamento (`formatMarketClose`), formatada no servidor. */
  marketCountdown: string | null;
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
  /**
   * O calendário real do circuito, com o mercado junto — vazio enquanto o
   * scrap não tiver rodado. É a única lista da Home: separar "a sua rodada"
   * do "o que vem" dava dois painéis com as mesmas partidas e relógios
   * diferentes.
   */
  upcoming: UpcomingMatches;
  /** `null` só enquanto nenhuma partida da rodada em curso tiver sido pontuada. */
  highlights: RoundHighlights | null;
};
