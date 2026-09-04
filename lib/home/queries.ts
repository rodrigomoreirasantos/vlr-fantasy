import type { ChampionshipPlacement } from "@/components/profile/championship-placements";
import {
  getStandingRowsForRoundByChampionship,
  listPendingInvites,
  listUserChampionships,
} from "@/lib/championship/queries";
import { rankStandings } from "@/lib/championship/standings";
import type { ChampionshipSummary } from "@/lib/championship/types";
import {
  patrimonyCents,
  patrimonyDeltaCents,
  placementChanges,
  projectRoundHighlights,
} from "@/lib/home/summary";
import type {
  HomeSummary,
  NextRoundBrief,
  RoundHighlights,
  RoundRecap,
} from "@/lib/home/types";
import { formatMarketCountdown, nextMarketClose } from "@/lib/market/window";
import {
  getLatestFinishedRound,
  getNextRound,
  getRoundByNumber,
  getRoundPriceMovers,
  getTeamRoundResult,
  getTopRoundScorers,
  listLiveRoundScores,
  listUpcomingMatches,
} from "@/lib/round/queries";
import type { RoundMatch, RoundTeamResult } from "@/lib/round/types";
import { getTeamOverview } from "@/lib/team/queries";
import type { RosterSlot } from "@/lib/team/types";

/** Quantos destaques listar em cada lado (maiores altas / maiores quedas). */
const PRICE_MOVER_LIMIT = 5;

/**
 * Quantos jogos do circuito a Home carrega. Maior que o que cabe na tela de
 * propósito: o filtro por campeonato precisa de material para filtrar, e uma
 * janela curta esconderia campeonatos inteiros do seletor.
 * `<UpcomingMatches>` é quem decide quantos exibir de cada vez.
 */
const UPCOMING_MATCH_LIMIT = 40;

/** As organizações dos 5 jogadores escalados, sem repetição. */
function organizationsOf(roster: readonly RosterSlot[]): string[] {
  return [
    ...new Set(
      roster.flatMap((slot) => (slot.player ? [slot.player.team] : [])),
    ),
  ];
}

type RoundRow = {
  id: string;
  number: number;
  marketOpensAt: Date;
  marketClosesAt: Date;
};

/**
 * O que aconteceu na última rodada fechada: pontos do time (já congelados em
 * `round_team_result`), variação de patrimônio e a colocação em cada
 * campeonato do usuário, com a variação em relação à rodada anterior.
 * `null` até a primeira rodada fechar, ou se este time nem existia nela
 * ainda (sem linha em `round_team_result`).
 */
async function buildRecap(
  fantasyTeamId: string,
  userId: string,
  championships: readonly ChampionshipSummary[],
  latestFinishedRound: RoundRow | null,
): Promise<RoundRecap | null> {
  if (!latestFinishedRound) return null;

  const teamResult = await getTeamRoundResult(
    fantasyTeamId,
    latestFinishedRound.id,
  );
  if (!teamResult) return null;

  const previousRound =
    latestFinishedRound.number > 1
      ? await getRoundByNumber(latestFinishedRound.number - 1)
      : undefined;
  const previousFinishedRound =
    previousRound?.status === "finished" ? previousRound : null;

  const previousTeamResult: RoundTeamResult | null = previousFinishedRound
    ? await getTeamRoundResult(fantasyTeamId, previousFinishedRound.id)
    : null;

  const championshipIds = championships.map((c) => c.id);
  const [currentStandings, previousStandings] = await Promise.all([
    getStandingRowsForRoundByChampionship(
      championshipIds,
      latestFinishedRound.id,
    ),
    previousFinishedRound
      ? getStandingRowsForRoundByChampionship(
          championshipIds,
          previousFinishedRound.id,
        )
      : null,
  ]);

  const placements: ChampionshipPlacement[] = championships.map(
    (championship) => {
      const currentRanked = rankStandings(
        currentStandings.get(championship.id) ?? [],
        userId,
      );
      const previousRanked = previousStandings
        ? rankStandings(previousStandings.get(championship.id) ?? [], userId)
        : null;
      const change = placementChanges(currentRanked, previousRanked, userId);
      const currentRow = currentRanked.find((row) => row.isCurrentUser);

      return {
        championship,
        position: currentRow?.position ?? 0,
        points: currentRow?.points ?? 0,
        change: change?.change ?? null,
      };
    },
  );

  return {
    roundNumber: latestFinishedRound.number,
    points: teamResult.points,
    patrimonyCents: patrimonyCents(teamResult),
    patrimonyDeltaCents: patrimonyDeltaCents(teamResult, previousTeamResult),
    placements,
  };
}

/**
 * A sua rodada corrente: o fechamento do mercado, jogo a jogo.
 *
 * **As partidas são as mesmas de "Próximos jogos"** — a lista do circuito,
 * vinda do scrap. Ler as partidas ligadas à rodada ativa era o que fazia o
 * painel anunciar um fechamento inexistente: com uma rodada de seed ativa, ele
 * mostrava a janela dela (dias à frente) enquanto o próximo jogo de verdade
 * era no dia seguinte.
 *
 * O countdown é o próximo fechamento entre essas partidas (`nextMarketClose`),
 * nunca a coluna `market_closes_at` — um número derivado do jogo não tem como
 * contradizer o jogo.
 */
function buildNextRoundBrief(
  nextRound: RoundRow,
  matches: readonly RoundMatch[],
  roster: readonly RosterSlot[],
): NextRoundBrief {
  const closesAt = nextMarketClose(matches);

  return {
    roundNumber: nextRound.number,
    marketOpensAt: nextRound.marketOpensAt,
    marketClosesAt: closesAt,
    marketCountdown: closesAt
      ? formatMarketCountdown({ opensAt: nextRound.marketOpensAt, closesAt })
      : null,
    matches: [...matches],
    myOrganizations: organizationsOf(roster),
  };
}

/**
 * Os destaques do jogo inteiro, na rodada mais recente que já tem números.
 *
 * A rodada **em andamento** vem primeiro, e é o ponto: as partidas terminam ao
 * longo da semana e `player_match_stat` já sabe quem pontuou muito antes de a
 * rodada fechar. Esperar o fechamento deixava a Home mostrando a semana
 * passada enquanto a atual acontecia. Sem nenhum jogo pontuado ainda, cai no
 * snapshot congelado da última rodada fechada — e só é `null` quando não
 * existe nem um nem outro.
 */
async function buildHighlights(
  latestFinishedRound: RoundRow | null,
  currentRound: RoundRow | null,
): Promise<RoundHighlights | null> {
  if (currentRound) {
    const liveScores = await listLiveRoundScores(currentRound.id);
    if (liveScores.length > 0) {
      return {
        roundNumber: currentRound.number,
        partial: true,
        ...projectRoundHighlights(liveScores, PRICE_MOVER_LIMIT),
      };
    }
  }

  if (!latestFinishedRound) return null;

  const [topScorers, movers] = await Promise.all([
    getTopRoundScorers(latestFinishedRound.id, 1),
    getRoundPriceMovers(latestFinishedRound.id, PRICE_MOVER_LIMIT),
  ]);

  return {
    roundNumber: latestFinishedRound.number,
    partial: false,
    topScorer: topScorers[0] ?? null,
    risers: movers.risers,
    fallers: movers.fallers,
  };
}

/**
 * O resumo completo da Home. Resolve em paralelo o que não depende de nada
 * (time, convites, campeonatos, rodada fechada, rodada corrente) e só então
 * sequencia o que depende do `roundId` resolvido. Reusa `getTeamOverview`
 * com exatamente os mesmos argumentos do layout logado
 * (`app/(app)/layout.tsx`) — a memoização por request (`cache()`) evita uma
 * segunda consulta ao time.
 */
export async function getHomeSummary(
  userId: string,
  userName: string,
): Promise<HomeSummary> {
  const [
    overview,
    pendingInvites,
    championships,
    latestFinishedRound,
    nextRound,
    upcomingMatches,
  ] = await Promise.all([
    getTeamOverview(userId, userName),
    listPendingInvites(userId),
    listUserChampionships(userId),
    getLatestFinishedRound(),
    getNextRound(),
    listUpcomingMatches(UPCOMING_MATCH_LIMIT),
  ]);

  if (!overview) {
    throw new Error("Não foi possível carregar o seu time.");
  }

  const [recap, highlights] = await Promise.all([
    buildRecap(
      overview.teamId,
      userId,
      championships,
      latestFinishedRound ?? null,
    ),
    buildHighlights(latestFinishedRound ?? null, nextRound ?? null),
  ]);

  const nextRoundBrief = nextRound
    ? buildNextRoundBrief(nextRound, upcomingMatches, overview.roster)
    : null;

  return {
    pendingInvites,
    hasFinishedRound: latestFinishedRound !== undefined,
    recap,
    nextRound: nextRoundBrief,
    upcoming: {
      matches: upcomingMatches,
      myOrganizations: organizationsOf(overview.roster),
    },
    highlights,
  };
}
