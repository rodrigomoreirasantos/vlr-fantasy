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
  pendingRegions,
  trimHighlights,
  PRICE_MOVER_LIMIT,
} from "@/lib/home/summary";
import type {
  HomeSummary,
  RoundHighlights,
  RoundRecap,
} from "@/lib/home/types";
import { listRosterPerformances } from "@/lib/player/queries";
import type { EventRegion } from "@/lib/round/regions";
import { eventRegion } from "@/lib/round/regions";
import {
  getLatestFinishedRound,
  getNextRound,
  getRoundByNumber,
  getRoundPlayerEvents,
  getRoundPriceMovers,
  getTeamRoundResult,
  getTopRoundScorers,
  listLiveRoundScores,
  listMarketLockMatches,
  listUpcomingMatches,
} from "@/lib/round/queries";
import type { RoundTeamResult } from "@/lib/round/types";
import { getTeamOverview } from "@/lib/team/queries";
import type { RosterSlot } from "@/lib/team/types";

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
 * Os destaques do jogo inteiro, na rodada mais recente que já tem números.
 *
 * A rodada **em andamento** vem primeiro, e é o ponto: as partidas terminam ao
 * longo da semana e `player_match_stat` já sabe quem pontuou muito antes de a
 * rodada fechar. Esperar o fechamento deixava a Home mostrando a semana
 * passada enquanto a atual acontecia. Sem nenhum jogo pontuado ainda, cai no
 * snapshot congelado da última rodada fechada — e só é `null` quando não
 * existe nem um nem outro.
 *
 * As listas saem inteiras e com a região de cada jogador; quem corta é
 * `highlightsFor`, no cliente, depois de escolhida a região.
 */
async function buildHighlights(
  latestFinishedRound: RoundRow | null,
  currentRound: RoundRow | null,
  pending: EventRegion[],
): Promise<RoundHighlights | null> {
  if (currentRound) {
    const liveScores = await listLiveRoundScores(currentRound.id);
    if (liveScores.length > 0) {
      return {
        partial: true,
        pending,
        ...trimHighlights(
          projectRoundHighlights(liveScores),
          PRICE_MOVER_LIMIT,
        ),
      };
    }
  }

  if (!latestFinishedRound) return null;

  // Uma consulta só para o campeonato de cada jogador, compartilhada pelas
  // duas listas — antes cada uma refazia a mesma agregação sobre
  // `player_match_stat ⋈ match` para a mesma rodada.
  const [scorers, movers, events] = await Promise.all([
    getTopRoundScorers(latestFinishedRound.id),
    getRoundPriceMovers(latestFinishedRound.id),
    getRoundPlayerEvents(latestFinishedRound.id),
  ]);

  return {
    partial: false,
    pending,
    // `event` é `null` quando a linha congelada não tem partida extraída
    // correspondente (jogador de uma rodada de seed): vira "other", nunca uma
    // região inventada.
    ...trimHighlights(
      {
        scorers: scorers.map((scorer) => ({
          ...scorer,
          region: eventRegion(events.get(scorer.playerId) ?? ""),
        })),
        movers: movers.map((mover) => ({
          ...mover,
          region: eventRegion(events.get(mover.playerId) ?? ""),
        })),
      },
      PRICE_MOVER_LIMIT,
    ),
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
    lockMatches,
  ] = await Promise.all([
    getTeamOverview(userId, userName),
    listPendingInvites(userId),
    listUserChampionships(userId),
    getLatestFinishedRound(),
    getNextRound(),
    listUpcomingMatches(UPCOMING_MATCH_LIMIT),
    // A janela larga (ontem → +7d) é a única que inclui partidas já
    // encerradas — e é justamente delas que sai "o último jogo do dia desta
    // região já acabou".
    listMarketLockMatches(),
  ]);

  if (!overview) {
    throw new Error("Não foi possível carregar o seu time.");
  }

  const rosterPlayerIds = overview.roster.flatMap((slot) =>
    slot.player ? [slot.player.id] : [],
  );

  const [recap, highlights, performances] = await Promise.all([
    buildRecap(
      overview.teamId,
      userId,
      championships,
      latestFinishedRound ?? null,
    ),
    buildHighlights(
      latestFinishedRound ?? null,
      nextRound ?? null,
      pendingRegions(lockMatches),
    ),
    listRosterPerformances(rosterPlayerIds),
  ]);

  return {
    pendingInvites,
    hasFinishedRound: latestFinishedRound !== undefined,
    recap,
    performances,
    upcoming: {
      matches: upcomingMatches,
      myOrganizations: organizationsOf(overview.roster),
    },
    highlights,
  };
}
