// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Padrão de `app/(app)/profile/actions.test.ts`: mocka as primitivas nomeadas
// de cada `queries.ts`, nunca uma cadeia `select().from().where()` montada à
// mão. Banco sempre mockado.
const mocks = vi.hoisted(() => ({
  getTeamOverview: vi.fn(),
  listPendingInvites: vi.fn(),
  listUserChampionships: vi.fn(),
  getLatestFinishedRound: vi.fn(),
  getNextRound: vi.fn(),
  getRoundByNumber: vi.fn(),
  listUpcomingMatches: vi.fn(),
  listMarketLockMatches: vi.fn(),
  listLiveRoundScores: vi.fn(),
  getTopRoundScorers: vi.fn(),
  getRoundPriceMovers: vi.fn(),
  getRoundPlayerEvents: vi.fn(),
  getTeamRoundResult: vi.fn(),
  listRosterPerformances: vi.fn(),
  getStandingRowsForRoundByChampionship: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {}, pool: { end: vi.fn() } }));

vi.mock("@/lib/team/queries", () => ({
  getTeamOverview: mocks.getTeamOverview,
}));

vi.mock("@/lib/championship/queries", () => ({
  listPendingInvites: mocks.listPendingInvites,
  listUserChampionships: mocks.listUserChampionships,
  getStandingRowsForRoundByChampionship:
    mocks.getStandingRowsForRoundByChampionship,
}));

vi.mock("@/lib/round/queries", () => ({
  getLatestFinishedRound: mocks.getLatestFinishedRound,
  getNextRound: mocks.getNextRound,
  getRoundByNumber: mocks.getRoundByNumber,
  listUpcomingMatches: mocks.listUpcomingMatches,
  listMarketLockMatches: mocks.listMarketLockMatches,
  listLiveRoundScores: mocks.listLiveRoundScores,
  getTopRoundScorers: mocks.getTopRoundScorers,
  getRoundPriceMovers: mocks.getRoundPriceMovers,
  getRoundPlayerEvents: mocks.getRoundPlayerEvents,
  getTeamRoundResult: mocks.getTeamRoundResult,
}));

vi.mock("@/lib/player/queries", () => ({
  listRosterPerformances: mocks.listRosterPerformances,
}));

// Import depois dos mocks, como o resto da suíte faz.
const { getHomeSummary } = await import("@/lib/home/queries");

const ROUND = {
  id: "round-7",
  number: 7,
  marketOpensAt: new Date("2026-08-31T00:00:00Z"),
  marketClosesAt: new Date("2026-09-06T00:00:00Z"),
};

function scorer(nickname: string, playerId = nickname) {
  return {
    playerId,
    nickname,
    team: "T1",
    role: "Duelista" as const,
    points: 42,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getTeamOverview.mockResolvedValue({
    teamId: "team-1",
    summary: {},
    roster: [{ id: "s1", captain: false, player: { id: "p1", team: "T1" } }],
    lockedTeams: [],
  });
  mocks.listPendingInvites.mockResolvedValue([]);
  mocks.listUserChampionships.mockResolvedValue([]);
  mocks.getLatestFinishedRound.mockResolvedValue(ROUND);
  mocks.getNextRound.mockResolvedValue(undefined);
  mocks.getRoundByNumber.mockResolvedValue(undefined);
  mocks.listUpcomingMatches.mockResolvedValue([]);
  mocks.listMarketLockMatches.mockResolvedValue([]);
  mocks.listLiveRoundScores.mockResolvedValue([]);
  mocks.getTeamRoundResult.mockResolvedValue(null);
  mocks.listRosterPerformances.mockResolvedValue([]);
  mocks.getRoundPriceMovers.mockResolvedValue([]);
  mocks.getTopRoundScorers.mockResolvedValue([scorer("Boaster")]);
  mocks.getRoundPlayerEvents.mockResolvedValue(
    new Map([["Boaster", "VCT 2026: EMEA Stage 2"]]),
  );
});

describe("getHomeSummary — a fiação do portão de destaques", () => {
  it("liga sem jogo na janela de trava continua com destaques", async () => {
    // O caso que a versão anterior escondia para sempre: a região do pontuador
    // não aparece em `listMarketLockMatches` (liga em intervalo entre stages),
    // e mesmo assim os destaques dela têm que sair.
    mocks.listMarketLockMatches.mockResolvedValue([]);

    const summary = await getHomeSummary("user-1", "Alfafa");

    expect(summary.highlights?.pending).toEqual([]);
    expect(summary.highlights?.scorers.map((row) => row.nickname)).toEqual([
      "Boaster",
    ]);
  });

  it("região com jogo de hoje ainda por acontecer entra em `pending`", async () => {
    const now = new Date();
    mocks.listMarketLockMatches.mockResolvedValue([
      {
        id: "m1",
        teamA: "FNATIC",
        teamB: "Team Heretics",
        event: "VCT 2026: EMEA Stage 2",
        scheduledAt: now,
        status: "upcoming",
        scoreA: null,
        scoreB: null,
      },
    ]);

    const summary = await getHomeSummary("user-1", "Alfafa");

    expect(summary.highlights?.pending).toEqual(["emea"]);
  });

  it("a região do pontuador vem do campeonato que ele disputou", async () => {
    const summary = await getHomeSummary("user-1", "Alfafa");

    expect(summary.highlights?.scorers[0]?.region).toBe("emea");
  });

  it("pontuador sem partida extraída cai em 'other', não numa região inventada", async () => {
    mocks.getRoundPlayerEvents.mockResolvedValue(new Map());

    const summary = await getHomeSummary("user-1", "Alfafa");

    expect(summary.highlights?.scorers[0]?.region).toBe("other");
  });

  it("as partidas dos escalados são pedidas pelos ids da escalação", async () => {
    await getHomeSummary("user-1", "Alfafa");

    expect(mocks.listRosterPerformances).toHaveBeenCalledWith(["p1"]);
  });

  it("sem rodada fechada nem rodada em curso, não há destaques", async () => {
    mocks.getLatestFinishedRound.mockResolvedValue(undefined);

    const summary = await getHomeSummary("user-1", "Alfafa");

    expect(summary.highlights).toBeNull();
    expect(summary.hasFinishedRound).toBe(false);
  });
});
