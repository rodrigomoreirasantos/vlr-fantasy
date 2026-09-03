import { describe, expect, it } from "vitest";

import {
  eventFilterOptions,
  eventTier,
  shortEventLabel,
} from "@/lib/round/events";
import type { RoundMatch } from "@/lib/round/types";

function match(event: string, id = event): RoundMatch {
  return {
    id,
    teamA: "NRG",
    teamB: "LOUD",
    event,
    scheduledAt: new Date("2026-09-04T17:00:00Z"),
    status: "upcoming",
    scoreA: null,
    scoreB: null,
  };
}

describe("eventTier", () => {
  it("reconhece Champions e Masters", () => {
    expect(eventTier("Valorant Champions 2026")).toBe("champions");
    expect(eventTier("VCT 2026: Masters Toronto")).toBe("masters");
  });

  it("'Champions Tour' é o circuito, não o torneio final", () => {
    expect(eventTier("Champions Tour 2026: Americas Stage 2")).toBe("league");
  });

  it("separa ligas regionais do circuito de desenvolvimento", () => {
    expect(eventTier("VCT 2026: Americas Stage 2")).toBe("league");
    expect(eventTier("Game Changers 2026: Brazil")).toBe("development");
    expect(eventTier("Challengers 2026: Brazil Split 2")).toBe("development");
  });

  it("o que não se reconhece cai em 'other'", () => {
    expect(eventTier("Red Bull Home Ground")).toBe("other");
  });
});

describe("eventFilterOptions", () => {
  it("põe Champions e Masters à frente das ligas", () => {
    const options = eventFilterOptions([
      match("VCT 2026: Americas Stage 2", "a"),
      match("VCT 2026: Masters Toronto", "b"),
      match("Valorant Champions 2026", "c"),
      match("Game Changers 2026: Brazil", "d"),
    ]);

    expect(options.map((option) => option.tier)).toEqual([
      "champions",
      "masters",
      "league",
      "development",
    ]);
  });

  it("conta os jogos de cada campeonato, sem repetir o campeonato", () => {
    const options = eventFilterOptions([
      match("VCT 2026: Americas Stage 2", "a"),
      match("VCT 2026: Americas Stage 2", "b"),
      match("VCT 2026: EMEA Stage 2", "c"),
    ]);

    expect(options).toEqual([
      {
        event: "VCT 2026: Americas Stage 2",
        label: "Americas Stage 2",
        tier: "league",
        count: 2,
      },
      {
        event: "VCT 2026: EMEA Stage 2",
        label: "EMEA Stage 2",
        tier: "league",
        count: 1,
      },
    ]);
  });

  it("dentro do mesmo nível, a grade maior vem primeiro", () => {
    const options = eventFilterOptions([
      match("VCT 2026: EMEA Stage 2", "a"),
      match("VCT 2026: Americas Stage 2", "b"),
      match("VCT 2026: Americas Stage 2", "c"),
    ]);

    expect(options.map((option) => option.event)).toEqual([
      "VCT 2026: Americas Stage 2",
      "VCT 2026: EMEA Stage 2",
    ]);
  });

  it("calendário vazio não oferece filtro nenhum", () => {
    expect(eventFilterOptions([])).toEqual([]);
  });
});

describe("shortEventLabel", () => {
  it("corta o circuito e o ano, que se repetem em todo chip", () => {
    expect(shortEventLabel("VCT 2026: Americas Stage 2")).toBe(
      "Americas Stage 2",
    );
    expect(shortEventLabel("Champions Tour 2026: Pacific Stage 1")).toBe(
      "Pacific Stage 1",
    );
    expect(shortEventLabel("Valorant Champions 2026")).toBe("Champions");
  });

  it("um nome que não segue o padrão fica inteiro", () => {
    expect(shortEventLabel("Red Bull Home Ground")).toBe(
      "Red Bull Home Ground",
    );
  });
});
