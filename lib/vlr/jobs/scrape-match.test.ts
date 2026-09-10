// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScrapedMatchDetail } from "@/lib/vlr/schemas";

// Banco e rede sempre mockados (CLAUDE.md): `revalidateMatch` é a única
// função exercitada aqui, e tudo que `persistMatchDetail` delega vira dublê —
// o que este arquivo prova é a Decisão 5 do plano 17 (digital igual não
// regrava nada; digital diferente reprocessa como extração nova).
const mocks = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  dbUpdateSetMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  fetchHtml: vi.fn(),
  parseMatchDetail: vi.fn(),
  fingerprint: vi.fn(),
  upsertEvents: vi.fn(),
  upsertTeams: vi.fn(),
  upsertMatches: vi.fn(),
  saveMatchStats: vi.fn(),
  applyMatchPlayerRegions: vi.fn(),
  logInfo: vi.fn(),
}));

const txStub = {
  query: {
    vlrEvent: {
      findFirst: vi.fn().mockResolvedValue({ region: "americas" }),
    },
  },
};

vi.mock("@/db", () => ({
  db: {
    query: { match: { findFirst: mocks.findFirstMock } },
    update: () => ({
      set: (values: unknown) => ({
        where: () => {
          mocks.dbUpdateSetMock(values);
          return Promise.resolve();
        },
      }),
    }),
    transaction: mocks.dbTransactionMock,
  },
  pool: { end: vi.fn() },
}));
vi.mock("@/lib/vlr/http/client", () => ({ fetchHtml: mocks.fetchHtml }));
vi.mock("@/lib/vlr/http/log", () => ({ logInfo: mocks.logInfo }));
vi.mock("@/lib/vlr/http/fingerprint", () => ({
  fingerprint: mocks.fingerprint,
}));
vi.mock("@/lib/vlr/scrapers/match-detail", () => ({
  parseMatchDetail: mocks.parseMatchDetail,
}));
vi.mock("@/lib/vlr/persist/events", () => ({
  upsertEvents: mocks.upsertEvents,
}));
vi.mock("@/lib/vlr/persist/teams", () => ({ upsertTeams: mocks.upsertTeams }));
vi.mock("@/lib/vlr/persist/matches", () => ({
  upsertMatches: mocks.upsertMatches,
}));
vi.mock("@/lib/vlr/persist/players", () => ({ resolvePlayer: vi.fn() }));
vi.mock("@/lib/vlr/persist/stats", () => ({
  saveMatchStats: mocks.saveMatchStats,
}));
vi.mock("@/lib/vlr/persist/player-regions", () => ({
  applyMatchPlayerRegions: mocks.applyMatchPlayerRegions,
}));

import { revalidateMatch } from "@/lib/vlr/jobs/scrape-match";

const DETAIL: ScrapedMatchDetail = {
  vlrId: "724899",
  event: { vlrId: "2776", name: "VCT 2026: Americas Stage 2", series: null },
  scheduledAt: new Date("2026-09-01T20:00:00Z"),
  teamA: { vlrId: "1001", name: "NRG" },
  teamB: { vlrId: "1002", name: "SEN" },
  scoreA: 2,
  scoreB: 1,
  bestOf: 3,
  status: "finished",
  maps: [],
};

function createStore() {
  return {
    put: vi.fn().mockResolvedValue("storage/raw/match/724899/new.html.gz"),
    get: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parseMatchDetail.mockReturnValue(DETAIL);
  mocks.fetchHtml.mockResolvedValue({ html: "<html>partida</html>" });
});

describe("revalidateMatch", () => {
  it("digital igual à da última extração: só carimba revalidatedAt, sem tocar disco nem estatística", async () => {
    mocks.findFirstMock.mockResolvedValue({
      id: "match-1",
      contentHash: "same-hash",
    });
    mocks.fingerprint.mockReturnValue("same-hash");
    const store = createStore();

    const result = await revalidateMatch("724899", store);

    expect(result).toEqual({ changed: false });
    expect(store.put).not.toHaveBeenCalled();
    expect(mocks.saveMatchStats).not.toHaveBeenCalled();
    expect(mocks.dbUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ revalidatedAt: expect.any(Date) }),
    );
  });

  it("digital diferente: salva o HTML novo e reprocessa como extração nova", async () => {
    mocks.findFirstMock.mockResolvedValue({
      id: "match-1",
      contentHash: "old-hash",
    });
    mocks.fingerprint.mockReturnValue("new-hash");
    mocks.dbTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(txStub),
    );
    mocks.upsertEvents.mockResolvedValue(new Map([["2776", "event-1"]]));
    mocks.upsertMatches.mockResolvedValue(new Map([["724899", "match-1"]]));
    const store = createStore();

    const result = await revalidateMatch("724899", store);

    expect(result).toEqual({ changed: true });
    expect(store.put).toHaveBeenCalledWith(
      "match",
      "724899",
      "<html>partida</html>",
    );
    expect(mocks.saveMatchStats).toHaveBeenCalledTimes(1);
    const [, args] = mocks.saveMatchStats.mock.calls[0]!;
    expect(args.contentHash).toBe("new-hash");
    expect(args.revalidatedAt).toBeInstanceOf(Date);
  });

  it("partida sem registro no banco: lança erro sem ir à rede", async () => {
    mocks.findFirstMock.mockResolvedValue(null);

    await expect(revalidateMatch("999999")).rejects.toThrow(/não existe/);
    expect(mocks.fetchHtml).not.toHaveBeenCalled();
  });
});
