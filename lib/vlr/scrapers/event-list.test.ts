// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readFixture } from "@/lib/vlr/fixtures/load";
import { parseEventList } from "@/lib/vlr/scrapers/event-list";
import { SelectorMissError } from "@/lib/vlr/scrapers/parse";

const NOW = new Date("2026-09-03T12:00:00Z");
const events = parseEventList(readFixture("event-list.html"), "/events", NOW);

describe("parseEventList", () => {
  it("extrai os eventos da página", () => {
    expect(events.length).toBeGreaterThan(10);
  });

  it("lê vlrId, nome e status", () => {
    const pacific = events.find((row) => row.vlrId === "2776")!;
    expect(pacific.name).toBe("VCT 2026: Pacific Stage 2");
    expect(pacific.status).toBe("ongoing");
  });

  it("lê a região da classe da bandeira, não de texto", () => {
    expect(events.find((row) => row.vlrId === "2776")!.region).toBe("kr");
  });

  it("infere o ano das datas, que o vlr não escreve", () => {
    const pacific = events.find((row) => row.vlrId === "2776")!;
    expect(pacific.startsAt?.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(pacific.endsAt?.toISOString().slice(0, 10)).toBe("2026-09-06");
  });

  it("todo evento tem um vlrId numérico", () => {
    expect(events.every((row) => /^\d+$/.test(row.vlrId))).toBe(true);
  });

  it("uma página sem evento nenhum lança SelectorMissError", () => {
    expect(() =>
      parseEventList("<html><body></body></html>", "/events"),
    ).toThrow(SelectorMissError);
  });
});
