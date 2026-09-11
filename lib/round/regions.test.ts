// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  eventRegion,
  isLeagueRegion,
  matchesInRegion,
  parseTeamRegion,
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

describe("matchesInRegion", () => {
  const matches = [
    match("VCT 2026: Americas Stage 2", "a"),
    match("VCT 2026: EMEA Stage 2", "b"),
    match("Valorant Champions 2026", "c"),
    match("Red Bull Home Ground", "d"), // "other"
  ];

  it("null devolve a grade inteira", () => {
    expect(matchesInRegion(matches, null)).toHaveLength(4);
  });

  it("uma liga devolve as dela mais as internacionais", () => {
    const ids = matchesInRegion(matches, "americas").map((m) => m.id);
    expect(ids).toEqual(["a", "c"]);
  });

  it("'international' devolve só os internacionais", () => {
    const ids = matchesInRegion(matches, "international").map((m) => m.id);
    expect(ids).toEqual(["c"]);
  });

  it("'other' não recebe internacional de brinde", () => {
    const ids = matchesInRegion(matches, "other").map((m) => m.id);
    expect(ids).toEqual(["d"]);
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
      // Pacific e China não têm jogo esta semana, mas continuam na lista.
      { region: "pacific", label: "Pacific", count: 0 },
      { region: "china", label: "China", count: 0 },
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
      "emea",
      "pacific",
      "china",
    ]);
  });

  it("a contagem de cada liga inclui os internacionais — o que o clique entrega", () => {
    const options = regionFilterOptions([
      match("Valorant Champions 2026", "a"),
      match("VCT 2026: Americas Stage 2", "b"),
      match("VCT 2026: EMEA Stage 2", "c"),
    ]);

    expect(options).toEqual([
      { region: "international", label: "Internacional", count: 1 },
      { region: "americas", label: "Americas", count: 2 },
      { region: "emea", label: "EMEA", count: 2 },
      // Pacific e China não jogam nada próprio, mas o Champions é de todo
      // mundo — quem clicar em "China" ainda vê essa partida.
      { region: "pacific", label: "Pacific", count: 1 },
      { region: "china", label: "China", count: 1 },
    ]);
  });

  it("uma liga sem jogo agendado aparece mesmo assim, com contagem zero", () => {
    const options = regionFilterOptions([
      match("VCT 2026: Americas Stage 2", "a"),
    ]);

    expect(options.find((o) => o.region === "emea")).toEqual({
      region: "emea",
      label: "EMEA",
      count: 0,
    });
  });

  it("calendário vazio ainda oferece as quatro ligas, com contagem zero", () => {
    expect(regionFilterOptions([])).toEqual([
      { region: "americas", label: "Americas", count: 0 },
      { region: "emea", label: "EMEA", count: 0 },
      { region: "pacific", label: "Pacific", count: 0 },
      { region: "china", label: "China", count: 0 },
    ]);
  });

  it("'Outros' entra quando tem jogo próprio, mas não é forçado como as quatro ligas", () => {
    // Não bate nenhum padrão de região nem bandeira — cai em "other".
    const withOther = regionFilterOptions([match("Rivais 2026: Rio de Setup")]);
    expect(withOther.some((o) => o.region === "other")).toBe(true);

    const withoutOther = regionFilterOptions([
      match("VCT 2026: Americas Stage 2"),
    ]);
    expect(withoutOther.some((o) => o.region === "other")).toBe(false);
  });
});

describe("isLeagueRegion", () => {
  it("as quatro ligas são de liga", () => {
    expect(isLeagueRegion("americas")).toBe(true);
    expect(isLeagueRegion("emea")).toBe(true);
    expect(isLeagueRegion("pacific")).toBe(true);
    expect(isLeagueRegion("china")).toBe(true);
  });

  it("internacional e outros não são", () => {
    expect(isLeagueRegion("international")).toBe(false);
    expect(isLeagueRegion("other")).toBe(false);
  });
});

describe("parseTeamRegion", () => {
  it("aceita as cinco regiões de time", () => {
    expect(parseTeamRegion("americas")).toBe("americas");
    expect(parseTeamRegion("international")).toBe("international");
  });

  it("rejeita lixo do ?region=: string desconhecida, null, undefined, array", () => {
    expect(parseTeamRegion("xyz")).toBeNull();
    expect(parseTeamRegion("other")).toBeNull(); // "other" não é TeamRegion
    expect(parseTeamRegion(null)).toBeNull();
    expect(parseTeamRegion(undefined)).toBeNull();
    expect(parseTeamRegion(["americas"])).toBeNull();
  });
});
