// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScrapedMatchListItem } from "@/lib/vlr/schemas";

const mocks = vi.hoisted(() => ({
  fetchHtml: vi.fn(),
  parseMatchList: vi.fn(),
  resolveEventIdsByName: vi.fn(),
  toUpsertable: vi.fn(),
  upsertMatches: vi.fn(),
  pageChanged: vi.fn(),
  enqueue: vi.fn(),
  logInfo: vi.fn(),
}));

const txStub = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  }),
};

vi.mock("@/db", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn(txStub) },
  pool: { end: vi.fn() },
}));
vi.mock("@/lib/vlr/http/client", () => ({ fetchHtml: mocks.fetchHtml }));
vi.mock("@/lib/vlr/http/log", () => ({ logInfo: mocks.logInfo }));
vi.mock("@/lib/vlr/scrapers/match-list", () => ({
  parseMatchList: mocks.parseMatchList,
}));
vi.mock("@/lib/vlr/jobs/sync-schedule", () => ({
  resolveEventIdsByName: mocks.resolveEventIdsByName,
  toUpsertable: mocks.toUpsertable,
}));
vi.mock("@/lib/vlr/persist/matches", () => ({
  upsertMatches: mocks.upsertMatches,
}));
vi.mock("@/lib/vlr/persist/page-state", () => ({
  pageChanged: mocks.pageChanged,
}));
vi.mock("@/lib/vlr/jobs/queue", () => ({ enqueue: mocks.enqueue }));

import { syncResults } from "@/lib/vlr/jobs/sync-results";

function item(
  overrides: Partial<ScrapedMatchListItem> = {},
): ScrapedMatchListItem {
  return {
    vlrId: "1",
    teamA: "NRG",
    teamB: "SEN",
    scoreA: 2,
    scoreB: 1,
    scheduledAt: new Date("2026-09-10T20:00:00Z"),
    status: "finished",
    event: "VCT 2026: Americas Stage 2",
    eventSeries: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchHtml.mockResolvedValue({ html: "<html></html>" });
  mocks.parseMatchList.mockReturnValue([item()]);
  mocks.pageChanged.mockResolvedValue(true);
  mocks.resolveEventIdsByName.mockResolvedValue(new Map());
  mocks.toUpsertable.mockImplementation((row: unknown) => row);
  mocks.upsertMatches.mockResolvedValue(new Map());
  mocks.enqueue.mockResolvedValue(1);
});

describe("syncResults — digital da página (Decisão 2, plano 17)", () => {
  it("página idêntica à última leitura: não faz upsert nem enfileira", async () => {
    mocks.pageChanged.mockResolvedValue(false);

    const result = await syncResults();

    expect(result).toEqual({ matches: 1, enqueued: 0, pages: 1 });
    expect(mocks.upsertMatches).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("página diferente da última leitura: segue o fluxo normal", async () => {
    mocks.pageChanged.mockResolvedValue(true);

    const result = await syncResults();

    expect(result).toEqual({ matches: 1, enqueued: 1, pages: 1 });
    expect(mocks.upsertMatches).toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalled();
  });

  it("página idêntica conta como página quieta e para a paginação em stopAfterKnown", async () => {
    mocks.pageChanged.mockResolvedValue(false);

    const result = await syncResults({ pages: 5, stopAfterKnown: 1 });

    expect(result.pages).toBe(1);
    expect(mocks.fetchHtml).toHaveBeenCalledTimes(1);
  });
});
