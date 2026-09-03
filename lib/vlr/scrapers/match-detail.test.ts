// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readFixture } from "@/lib/vlr/fixtures/load";
import { SelectorMissError } from "@/lib/vlr/scrapers/parse";
import { parseMatchDetail } from "@/lib/vlr/scrapers/match-detail";

const HTML = readFixture("match-detail-724899.html");
const detail = parseMatchDetail(HTML, "724899");

describe("parseMatchDetail — cabeçalho", () => {
  it("lê evento, série e o vlrId do evento", () => {
    expect(detail.event.name).toBe("Game Changers 2026: North America Stage 2");
    expect(detail.event.vlrId).toBe("3037");
    expect(detail.event.series).toContain("Upper Semifinals");
  });

  it("converte `data-utc-ts` de America/New_York para UTC", () => {
    // A página traz `data-utc-ts="2026-09-02 17:00:00"` e imprime "5:00 PM EDT".
    expect(detail.scheduledAt.toISOString()).toBe("2026-09-02T21:00:00.000Z");
  });

  it("lê os dois times com nome e vlrId", () => {
    expect(detail.teamA).toEqual({ vlrId: "6456", name: "FlyQuest RED" });
    expect(detail.teamB).toEqual({ vlrId: "22920", name: "Axolotl" });
  });

  it("lê o placar da série na ordem do documento, não na ordem vencedor/perdedor", () => {
    expect(detail.scoreA).toBe(2);
    expect(detail.scoreB).toBe(1);
  });

  it("lê o formato e o status", () => {
    expect(detail.bestOf).toBe(3);
    expect(detail.status).toBe("finished");
  });
});

describe("parseMatchDetail — mapas", () => {
  it("separa os mapas por `data-game-id` e descarta o agregado `all`", () => {
    expect(detail.maps.map((map) => map.gameVlrId)).toEqual([
      "278704",
      "278705",
      "278706",
    ]);
    expect(detail.maps.some((map) => map.gameVlrId === "all")).toBe(false);
  });

  it("lê nome, duração e placar de cada mapa — sem o rótulo 'PICK'", () => {
    const [ascent] = detail.maps;
    expect(ascent.name).toBe("Ascent");
    expect(ascent.durationSeconds).toBe(49 * 60 + 59);
    expect(ascent.scoreA).toBe(8);
    expect(ascent.scoreB).toBe(13);
  });

  it("cada mapa traz os 10 jogadores, 5 por time", () => {
    for (const map of detail.maps) {
      expect(map.players).toHaveLength(10);
      expect(map.players.filter((row) => row.won)).toHaveLength(5);
    }
  });

  it("marca `won` pelo `.mod-win` do lado certo", () => {
    const [ascent] = detail.maps;
    // Axolotl venceu 13x8: quem perdeu é o time da esquerda (FLY).
    const fly = ascent.players.filter((row) => row.teamTag === "FLY");
    const axl = ascent.players.filter((row) => row.teamTag === "AXL");
    expect(fly.every((row) => row.won === false)).toBe(true);
    expect(axl.every((row) => row.won === true)).toBe(true);
  });
});

describe("parseMatchDetail — linha de jogador", () => {
  const edith = () =>
    detail.maps[0].players.find((row) => row.nickname === "edith")!;

  it("lê o vlrId do jogador do href — a identidade não é heurística", () => {
    expect(edith().vlrId).toBe("30395");
  });

  it("lê K/D/A, ACS e demais estatísticas do span `.mod-both`", () => {
    expect(edith()).toMatchObject({
      kills: 17,
      deaths: 14,
      assists: 3,
      acs: 221,
      kast: 67,
      adr: 132,
      headshotPct: 19,
      firstKills: 5,
      firstDeaths: 3,
    });
  });

  it("pega `.mod-both` mesmo na coluna cujos spans vêm fora de ordem (rating2)", () => {
    // Na fixture, `rating2` aparece ora como (both, t, ct), ora como
    // (t, ct, both). Pegar "o primeiro span" daria 0.23 em vez de 1.06.
    expect(edith().rating).toBe(1.06);
    for (const map of detail.maps) {
      for (const row of map.players) {
        // Rating de mapa vive na casa da unidade; um valor de lado (T ou CT)
        // vazaria como número plausível, mas o par (rating, acs) não bateria.
        expect(row.rating).not.toBeNull();
      }
    }
  });

  it("lê agente, país e sigla do time", () => {
    expect(edith().agents).toEqual(["Neon"]);
    // Código de duas letras, o mesmo formato de `team-roster.ts` e o que
    // `player.country` documenta — não o `title` "United States".
    expect(edith().country).toBe("us");
    expect(edith().teamTag).toBe("FLY");
  });
});

describe("parseMatchDetail — falhas", () => {
  it("um HTML sem `.match-header` lança SelectorMissError, nunca devolve vazio", () => {
    expect(() => parseMatchDetail("<html><body></body></html>", "1")).toThrow(
      SelectorMissError,
    );
  });

  it("o erro nomeia o seletor e a partida", () => {
    try {
      parseMatchDetail("<html><body></body></html>", "724899");
      expect.unreachable("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(SelectorMissError);
      expect((error as SelectorMissError).message).toContain(".match-header");
      expect((error as SelectorMissError).message).toContain("724899");
    }
  });
});

describe("parseMatchDetail — lado do time", () => {
  it("marca o lado de cada jogador pela tabela em que a linha está", () => {
    const [ascent] = detail.maps;
    const sideA = ascent.players.filter((row) => row.teamSide === "a");
    const sideB = ascent.players.filter((row) => row.teamSide === "b");

    // É o que liga o jogador ao NOME da organização: o scoreboard só traz a
    // sigla ("FLY"), e é do cabeçalho que vem "FlyQuest RED".
    expect(sideA).toHaveLength(5);
    expect(sideB).toHaveLength(5);
    expect(sideA.every((row) => row.teamTag === "FLY")).toBe(true);
    expect(sideB.every((row) => row.teamTag === "AXL")).toBe(true);
  });
});
