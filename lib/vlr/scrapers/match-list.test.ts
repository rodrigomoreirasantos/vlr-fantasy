// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readFixture } from "@/lib/vlr/fixtures/load";
import { lastListPage, parseMatchList } from "@/lib/vlr/scrapers/match-list";
import { SelectorMissError } from "@/lib/vlr/scrapers/parse";

const schedule = parseMatchList(
  readFixture("match-list-schedule.html"),
  "/matches",
);
const results = parseMatchList(
  readFixture("match-list-results.html"),
  "/matches/results",
);

describe("parseMatchList — /matches (por vir)", () => {
  it("extrai os 50 cards da página", () => {
    expect(schedule).toHaveLength(50);
  });

  it("lê vlrId, times e evento", () => {
    const match = schedule.find((row) => row.vlrId === "747658")!;
    expect(match.teamA).toBe("ALTERNATE aTTaX");
    expect(match.teamB).toBe("RIZON");
    expect(match.event).toBe("THE POKAL 2026");
    expect(match.eventSeries).toContain("Upper Quarterfinals");
  });

  it("associa cada card ao cabeçalho de dia correto, que vive fora do card", () => {
    // "Thu, September 3, 2026" + "2:00 PM" em Nova York = 18:00Z.
    const match = schedule.find((row) => row.vlrId === "747658")!;
    expect(match.scheduledAt?.toISOString()).toBe("2026-09-03T18:00:00.000Z");
  });

  it("partida por vir tem placar nulo e status upcoming", () => {
    const match = schedule.find((row) => row.vlrId === "747658")!;
    expect(match.scoreA).toBeNull();
    expect(match.scoreB).toBeNull();
    expect(match.status).toBe("upcoming");
  });

  it("todo card da agenda está sem placar — nenhum é confundido com encerrado", () => {
    expect(schedule.every((row) => row.scoreA === null)).toBe(true);
    expect(schedule.every((row) => row.status !== "finished")).toBe(true);
  });
});

describe("parseMatchList — /matches/results (encerradas)", () => {
  it("extrai os 50 cards da página", () => {
    expect(results).toHaveLength(50);
  });

  it("lê o placar real: `mod-dash` ali é máscara de spoiler, não 'sem placar'", () => {
    const match = results.find((row) => row.vlrId === "748620")!;
    expect(match.scoreA).toBe(0);
    expect(match.scoreB).toBe(2);
    expect(match.status).toBe("finished");
  });

  it("toda partida encerrada tem os dois placares preenchidos", () => {
    for (const row of results) {
      expect(row.status).toBe("finished");
      expect(row.scoreA).not.toBeNull();
      expect(row.scoreB).not.toBeNull();
    }
  });
});

describe("parseMatchList — falhas", () => {
  it("uma página sem card nenhum lança SelectorMissError, nunca devolve []", () => {
    expect(() =>
      parseMatchList("<html><body></body></html>", "/matches"),
    ).toThrow(SelectorMissError);
  });
});

describe("lastListPage", () => {
  it("lê a última página anunciada em /matches", () => {
    expect(lastListPage(readFixture("match-list-schedule.html"))).toBe(2);
  });

  it("lê a última página anunciada em /matches/results, mesmo com '…' no meio", () => {
    expect(lastListPage(readFixture("match-list-results.html"))).toBe(664);
  });

  it("sem bloco de paginação (página única), devolve 1", () => {
    expect(lastListPage("<html><body></body></html>")).toBe(1);
  });
});
