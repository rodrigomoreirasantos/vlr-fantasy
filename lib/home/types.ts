import type { ChampionshipPlacement } from "@/components/profile/championship-placements";
import type { PendingInvite } from "@/lib/championship/types";
import type { PlayerMatchPerformance } from "@/lib/player/types";
import type { EventRegion } from "@/lib/round/regions";
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
 *
 * **Sem `marketClosesAt`/`marketCountdown`:** o mercado fecha por campeonato +
 * dia (`marketClosesByMatch`), então um relógio único sobre o circuito inteiro
 * anunciaria um fechamento que não é o de ninguém. O countdown só existe
 * depois que o usuário escolhe uma região, e aí é o cliente quem o calcula
 * com as mesmas funções puras.
 */
export type UpcomingMatches = {
  matches: RoundMatch[];
  /** Organizações dos seus 5 — destacam a partida deles na lista. */
  myOrganizations: readonly string[];
};

/** Um pontuador da rodada, com a região do campeonato em que ele jogou. */
export type RegionalScorer = RoundScorer & { region: EventRegion };

/** Um jogador que valorizou/desvalorizou, com a região do campeonato dele. */
export type RegionalPriceMover = PriceMover & { region: EventRegion };

/**
 * Os destaques do jogo inteiro na rodada — fechada ou em andamento.
 *
 * As listas vêm **inteiras**, com a região de cada jogador: trocar de região é
 * filtrar um array (`highlightsFor`), nunca uma consulta nova — o mesmo
 * princípio do filtro de campeonato que já existia no calendário.
 */
export type RoundHighlights = {
  /**
   * A rodada ainda está aberta: os números vêm de `player_match_stat` e
   * mudam a cada jogo encerrado, e as variações de preço são projeções.
   * `false` é o snapshot congelado de `round_player_score`.
   */
  partial: boolean;
  scorers: RegionalScorer[];
  movers: RegionalPriceMover[];
  /**
   * As regiões que ainda jogam hoje — as únicas escondidas. Mostrar quem está
   * pontuando enquanto a liga joga seria entregar o resultado de uma partida
   * em andamento. Guardamos o que esconder, e não o que mostrar, para que uma
   * região ausente do calendário apareça em vez de sumir (ver
   * `pendingRegions`).
   */
  pending: EventRegion[];
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
   * As partidas dos seus 5, mais recentes primeiro — a matéria-prima do
   * gráfico de forma e dos placares. Vazia enquanto nenhum dos escalados
   * tiver partida extraída.
   */
  performances: PlayerMatchPerformance[];
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
