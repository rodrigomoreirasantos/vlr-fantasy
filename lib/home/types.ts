import type { ChampionshipPlacement } from "@/components/profile/championship-placements";
import type { PendingInvite } from "@/lib/championship/types";
import type { EventTier } from "@/lib/round/events";
import type { PriceMover, RoundMatch, RoundScorer } from "@/lib/round/types";

/**
 * Quando o mercado fecha para um campeonato da rodada — uma hora antes do
 * primeiro jogo dele (`roundMarketWindows`, summary.ts).
 */
export type RoundMarketWindow = {
  event: string;
  /** `shortEventLabel(event)` — o texto do chip. */
  label: string;
  tier: EventTier;
  closesAt: Date;
  /** A frase do estado do mercado, já formatada no servidor. */
  countdown: string;
  /** O primeiro jogo do campeonato na rodada: é ele que fecha esta janela. */
  firstMatch: { teamA: string; teamB: string; scheduledAt: Date };
  /** É o mais cedo de todos — o que de fato tranca a escalação. */
  binding: boolean;
};

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
 * A sua rodada corrente: quando o mercado fecha, campeonato a campeonato. Só
 * isso — o calendário é de `UpcomingMatches`, e o estado dos jogadores não é
 * dado que exista no Valorant competitivo (não há boletim de lesão nem
 * escalação divulgada com antecedência).
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
  /** Um fechamento por campeonato, do mais cedo para o mais tarde. */
  windows: RoundMarketWindow[];
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
