// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchHtml: vi.fn(),
  parseMatchList: vi.fn(),
  parseEventList: vi.fn(),
  parseMatchDetail: vi.fn(),
  parseTeamRoster: vi.fn(),
  countNeedsReview: vi.fn(),
  countScrapedMatches: vi.fn(),
  countPlayersOutOfRegion: vi.fn(),
  countDismissedMatches: vi.fn(),
  countRosterMissing: vi.fn(),
  runHealth: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/vlr/http/client", () => ({ fetchHtml: mocks.fetchHtml }));
vi.mock("@/lib/vlr/http/log", () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  logInfo: mocks.logInfo,
  logError: mocks.logError,
}));
vi.mock("@/lib/vlr/jobs/backfill", () => ({
  countNeedsReview: mocks.countNeedsReview,
}));
vi.mock("@/lib/vlr/jobs/calculate-round", () => ({
  countScrapedMatches: mocks.countScrapedMatches,
}));
vi.mock("@/lib/vlr/jobs/health", () => ({ runHealth: mocks.runHealth }));
vi.mock("@/lib/vlr/jobs/sync-player-regions", () => ({
  countPlayersOutOfRegion: mocks.countPlayersOutOfRegion,
}));
vi.mock("@/lib/vlr/persist/matches", () => ({
  countDismissedMatches: mocks.countDismissedMatches,
}));
vi.mock("@/lib/vlr/persist/rosters", () => ({
  countRosterMissing: mocks.countRosterMissing,
}));
vi.mock("@/lib/vlr/scrapers/event-list", () => ({
  parseEventList: mocks.parseEventList,
}));
vi.mock("@/lib/vlr/scrapers/match-detail", () => ({
  parseMatchDetail: mocks.parseMatchDetail,
}));
vi.mock("@/lib/vlr/scrapers/match-list", () => ({
  parseMatchList: mocks.parseMatchList,
}));
vi.mock("@/lib/vlr/scrapers/team-roster", () => ({
  parseTeamRoster: mocks.parseTeamRoster,
}));

import { runDoctor } from "@/lib/vlr/jobs/doctor";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchHtml.mockResolvedValue({ html: "<html></html>" });
  mocks.parseMatchList.mockReturnValue([{ vlrId: "1", status: "finished" }]);
  mocks.parseEventList.mockReturnValue([{ vlrId: "e1" }]);
  mocks.parseMatchDetail.mockReturnValue({ maps: [{ players: [{}] }] });
  mocks.parseTeamRoster.mockReturnValue({ players: [{}] });
  mocks.countNeedsReview.mockResolvedValue(0);
  mocks.countScrapedMatches.mockResolvedValue(10);
  mocks.countPlayersOutOfRegion.mockResolvedValue(0);
  mocks.countDismissedMatches.mockResolvedValue(0);
  mocks.countRosterMissing.mockResolvedValue(0);
  mocks.runHealth.mockResolvedValue({ healthy: true, stale: [] });
});

describe("runDoctor", () => {
  it("todos os seletores ok e todo job em dia: healthy true", async () => {
    const result = await runDoctor();

    expect(result.checks.every((check) => check.status === "ok")).toBe(true);
    expect(result.healthy).toBe(true);
    expect(result.staleJobs).toEqual([]);
  });

  it("seletores ok mas há job atrasado/sem rodar/em falha: healthy false (Decisão 7, plano 17)", async () => {
    mocks.runHealth.mockResolvedValue({
      healthy: false,
      stale: ["vlr:results"],
    });

    const result = await runDoctor();

    expect(result.checks.every((check) => check.status === "ok")).toBe(true);
    expect(result.healthy).toBe(false);
    expect(result.staleJobs).toEqual(["vlr:results"]);
  });

  it("relata partidas descartadas e jogadores fora do elenco da organização", async () => {
    mocks.countDismissedMatches.mockResolvedValue(3);
    mocks.countRosterMissing.mockResolvedValue(2);

    const result = await runDoctor();

    expect(result.dismissedMatches).toBe(3);
    expect(result.rosterMissing).toBe(2);
  });
});
