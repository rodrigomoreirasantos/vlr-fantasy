// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  eventRegion,
  regionColor,
  regionFilterOptions,
  regionLabel,
} from "@/lib/round/regions";
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

describe("eventRegion", () => {
  it("reconhece as quatro ligas pelo nome do campeonato", () => {
    expect(eventRegion("Champions Tour 2026: Americas Stage 2")).toBe(
      "americas",
    );
    expect(eventRegion("VCT 2026: EMEA Kickoff")).toBe("emea");
    expect(eventRegion("VCT 2026: Pacific Stage 1")).toBe("pacific");
    expect(eventRegion("VCT 2026: China Stage 1")).toBe("china");
  });

  it("cobre as variações regionais do circuito de desenvolvimento", () => {
    expect(eventRegion("Challengers 2026: Brazil Split 2")).toBe("americas");
    expect(eventRegion("Game Changers 2026 North America")).toBe("americas");
    expect(eventRegion("Challengers 2026: Korea Split 1")).toBe("pacific");
    expect(eventRegion("Challengers 2026: Turkey Birlik")).toBe("emea");
  });

  it("Masters e Champions sem liga são internacionais", () => {
    expect(eventRegion("Valorant Champions 2026")).toBe("international");
    expect(eventRegion("VCT 2026: Masters Toronto")).toBe("international");
  });

  it("a sede não define a região: Masters Toronto não é Americas", () => {
    expect(eventRegion("VCT 2026: Masters Toronto")).not.toBe("americas");
  });

  it("um estágio regional de Champions Tour continua sendo da liga", () => {
    expect(eventRegion("Champions Tour 2026: Pacific Stage 1")).toBe("pacific");
  });

  it("sem token no nome, cai na bandeira do vlr", () => {
    expect(eventRegion("Red Bull Home Ground", "kr")).toBe("pacific");
    expect(eventRegion("Red Bull Home Ground", "BR")).toBe("americas");
  });

  it("sem token e sem bandeira, é 'other'", () => {
    expect(eventRegion("Red Bull Home Ground")).toBe("other");
    expect(eventRegion("Red Bull Home Ground", null)).toBe("other");
    expect(eventRegion("Red Bull Home Ground", "zz")).toBe("other");
  });

  it("o nome tem prioridade sobre a bandeira", () => {
    expect(eventRegion("VCT 2026: Pacific Stage 1", "br")).toBe("pacific");
  });
});

describe("regionLabel", () => {
  it("rotula em pt-BR sem traduzir o nome das ligas", () => {
    expect(regionLabel("international")).toBe("Internacional");
    expect(regionLabel("other")).toBe("Outros");
    expect(regionLabel("emea")).toBe("EMEA");
  });
});

describe("regionColor", () => {
  it("devolve variável de tema, nunca cor literal", () => {
    expect(regionColor("americas")).toBe("var(--chart-2)");
    expect(regionColor("other")).toBe("var(--muted-foreground)");
  });
});

describe("regionFilterOptions", () => {
  it("conta os jogos de cada região, sem repetir a região", () => {
    const options = regionFilterOptions([
      match("VCT 2026: Americas Stage 2", "a"),
      match("Challengers 2026: Brazil Split 2", "b"),
      match("VCT 2026: EMEA Stage 2", "c"),
    ]);

    expect(options).toEqual([
      { region: "americas", label: "Americas", count: 2 },
      { region: "emea", label: "EMEA", count: 1 },
    ]);
  });

  it("internacional vem primeiro, mesmo com menos jogos", () => {
    const options = regionFilterOptions([
      match("VCT 2026: Americas Stage 2", "a"),
      match("VCT 2026: Americas Stage 2", "b"),
      match("Valorant Champions 2026", "c"),
    ]);

    expect(options.map((option) => option.region)).toEqual([
      "international",
      "americas",
    ]);
  });

  it("calendário vazio não oferece filtro nenhum", () => {
    expect(regionFilterOptions([])).toEqual([]);
  });
});
