// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScrapedMatchListItem } from "@/lib/vlr/schemas";

// Banco sempre mockado (CLAUDE.md) e nenhuma rede em teste: `fetchHtml` e os
// parsers viram dublês controláveis por página.
const mocks = vi.hoisted(() => ({
  fetchHtml: vi.fn(),
  parseMatchList: vi.fn(),
  lastListPage: vi.fn(),
  upsertMatches: vi.fn(),
  syncRoundsFromMatches: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

// `resolveEventIdsByName` roda dentro da própria `syncSchedule` usando o `tx`
// da transação — um stub de `Querier` cujo `select().from().where()` nunca
// acha evento nenhum é o bastante: o que este arquivo testa é a paginação, não
// o casamento de nomes (isso é `sync-schedule.test.ts` de outro escopo, ainda
// a escrever se um dia o casamento precisar de cobertura própria aqui).
const txStub = {
  select: () => ({
    from: () => ({
      where: () => Promise.resolve([]),
    }),
  }),
  update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
};

vi.mock("@/db", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn(txStub) },
  pool: { end: vi.fn() },
}));

vi.mock("@/lib/vlr/http/client", () => ({ fetchHtml: mocks.fetchHtml }));
vi.mock("@/lib/vlr/http/log", () => ({
  logWarn: mocks.logWarn,
  logInfo: mocks.logInfo,
}));
vi.mock("@/lib/vlr/scrapers/match-list", () => ({
  parseMatchList: mocks.parseMatchList,
  lastListPage: mocks.lastListPage,
}));
vi.mock("@/lib/vlr/persist/matches", () => ({
  upsertMatches: mocks.upsertMatches,
}));
vi.mock("@/lib/vlr/persist/rounds", () => ({
  syncRoundsFromMatches: mocks.syncRoundsFromMatches,
}));

// Import depois dos mocks, como o resto da suíte faz.
const { syncSchedule } = await import("@/lib/vlr/jobs/sync-schedule");

/** Um card mínimo e válido, com horário — o caso comum. */
function item(overrides: Partial<ScrapedMatchListItem> = {}): ScrapedMatchListItem {
  return {
    vlrId: "1",
    teamA: "NRG",
    teamB: "SEN",
    scoreA: null,
    scoreB: null,
    scheduledAt: new Date("2026-09-10T20:00:00Z"),
    status: "upcoming",
    event: "VCT 2026: Americas Stage 2",
    eventSeries: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchHtml.mockImplementation((path: string) =>
    Promise.resolve({ html: `<!-- ${path} -->` }),
  );
  mocks.upsertMatches.mockResolvedValue(new Map());
  mocks.syncRoundsFromMatches.mockResolvedValue([]);
});

describe("syncSchedule — paginação", () => {
  it("página única (sem paginação) faz uma chamada só", async () => {
    mocks.lastListPage.mockReturnValue(1);
    mocks.parseMatchList.mockReturnValue([item({ vlrId: "1" })]);

    const result = await syncSchedule();

    expect(mocks.fetchHtml).toHaveBeenCalledTimes(1);
    expect(mocks.fetchHtml).toHaveBeenCalledWith("/matches");
    expect(result).toEqual({ matches: 1, rounds: 0, pages: 1 });
  });

  it("visita /matches e /matches/?page=2 quando a página 1 anuncia 2, e soma os cards", async () => {
    mocks.lastListPage.mockReturnValue(2);
    mocks.parseMatchList.mockImplementation((html: string) =>
      html.includes("page=2")
        ? [item({ vlrId: "2" })]
        : [item({ vlrId: "1" })],
    );

    const result = await syncSchedule();

    expect(mocks.fetchHtml).toHaveBeenCalledTimes(2);
    expect(mocks.fetchHtml).toHaveBeenNthCalledWith(1, "/matches");
    expect(mocks.fetchHtml).toHaveBeenNthCalledWith(2, "/matches/?page=2");
    expect(result.matches).toBe(2);

    const [rows] = mocks.upsertMatches.mock.calls[0]!.slice(1);
    expect(rows.map((row: { vlrId: string }) => row.vlrId)).toEqual([
      "1",
      "2",
    ]);
  });

  it("`{ pages: 1 }` explícito não pagina, mesmo a página anunciando 2", async () => {
    mocks.lastListPage.mockReturnValue(2);
    mocks.parseMatchList.mockReturnValue([item()]);

    await syncSchedule({ pages: 1 });

    expect(mocks.fetchHtml).toHaveBeenCalledTimes(1);
  });

  it("o teto de segurança corta a varredura e avisa", async () => {
    mocks.lastListPage.mockReturnValue(1);
    mocks.parseMatchList.mockReturnValue([item()]);

    const result = await syncSchedule({ pages: 999 });

    expect(result.pages).toBe(12); // MAX_SCHEDULE_PAGES
    expect(mocks.fetchHtml).toHaveBeenCalledTimes(12);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "vlr.schedule.pages_truncated",
      { announced: 999, visited: 12 },
    );
  });

  it("card sem horário (TBD) continua fora do lote", async () => {
    mocks.lastListPage.mockReturnValue(1);
    mocks.parseMatchList.mockReturnValue([
      item({ vlrId: "1" }),
      item({ vlrId: "2", scheduledAt: null, status: "upcoming" }),
    ]);

    const result = await syncSchedule();

    expect(result.matches).toBe(1);
    const [rows] = mocks.upsertMatches.mock.calls[0]!.slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].vlrId).toBe("1");
  });
});
