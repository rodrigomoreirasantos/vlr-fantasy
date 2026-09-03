// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  SCOUT_RULES,
  SCOUT_VERSION,
  mapPoints,
  seriesPoints,
  type MapStatInput,
} from "@/lib/scoring/scout";

/** Linha neutra: nenhum evento, nenhuma faixa, derrota. Vale 0. */
const BLANK: MapStatInput = {
  kills: 0,
  deaths: 0,
  assists: 0,
  firstKills: 0,
  firstDeaths: 0,
  acs: null,
  kast: null,
  adr: null,
  rating: null,
  won: false,
};

describe("mapPoints", () => {
  it("uma linha em branco vale 0", () => {
    expect(mapPoints(BLANK)).toBe(0);
  });

  it("soma os eventos com os pesos da tabela", () => {
    // 20 kills (+40), 12 deaths (-12), 6 assists (+3), 3 FK (+4.5), 1 FD (-1)
    expect(
      mapPoints({
        ...BLANK,
        kills: 20,
        deaths: 12,
        assists: 6,
        firstKills: 3,
        firstDeaths: 1,
      }),
    ).toBe(34.5);
  });

  it("uma atuação excelente soma eventos, faixas e a vitória do mapa", () => {
    // eventos: 25*2 - 10 + 4*0.5 + 4*1.5 - 1 = 50 - 10 + 2 + 6 - 1 = 47
    // faixas: acs 280 (+3), kast 80 (+2), adr 160 (+2), rating 1.35 (+3) = 10
    // vitória: +2 → 59
    expect(
      mapPoints({
        kills: 25,
        deaths: 10,
        assists: 4,
        firstKills: 4,
        firstDeaths: 1,
        acs: 280,
        kast: 80,
        adr: 160,
        rating: 1.35,
        won: true,
      }),
    ).toBe(59);
  });

  it("uma atuação ruim aplica a penalidade de rating e pode ficar negativa", () => {
    // eventos: 5*2 - 18 + 2*0.5 + 0 - 3 = 10 - 18 + 1 - 3 = -10
    // faixas: nenhuma. penalidade: rating 0.55 < 0.8 → -2. derrota: 0 → -12
    expect(
      mapPoints({
        kills: 5,
        deaths: 18,
        assists: 2,
        firstKills: 0,
        firstDeaths: 3,
        acs: 120,
        kast: 55,
        adr: 90,
        rating: 0.55,
        won: false,
      }),
    ).toBe(-12);
  });

  it("as faixas de ACS NÃO empilham: 260 vale a faixa de 250, não as duas", () => {
    const acs260 = mapPoints({ ...BLANK, acs: 260 });
    const acs210 = mapPoints({ ...BLANK, acs: 210 });

    expect(acs260).toBe(3);
    expect(acs210).toBe(1.5);
    expect(acs260).toBeLessThan(3 + 1.5);
  });

  it("estatística ausente não dispara faixa nem penalidade — nunca NaN", () => {
    const points = mapPoints({ ...BLANK, kills: 10, rating: null });
    expect(points).toBe(20);
    expect(Number.isNaN(points)).toBe(false);
  });

  it("a vitória do mapa soma, mantendo o resto igual", () => {
    const stat = { ...BLANK, kills: 10 };
    expect(mapPoints({ ...stat, won: true }) - mapPoints(stat)).toBe(
      SCOUT_RULES.mapWin,
    );
  });

  it("arredonda para uma casa decimal — o que `numeric(6,1)` aceita", () => {
    // 3 assists = 1.5 ponto; a soma nunca sai com resíduo binário.
    expect(mapPoints({ ...BLANK, assists: 3 })).toBe(1.5);
  });
});

describe("seriesPoints", () => {
  it("a série é a soma dos mapas", () => {
    const maps: MapStatInput[] = [
      { ...BLANK, kills: 20, deaths: 12, won: true },
      { ...BLANK, kills: 15, deaths: 14, won: false },
    ];
    expect(seriesPoints(maps)).toBe(mapPoints(maps[0]) + mapPoints(maps[1]));
  });

  it("uma série sem mapas vale 0", () => {
    expect(seriesPoints([])).toBe(0);
  });
});

describe("SCOUT_VERSION", () => {
  it("é um inteiro positivo — é gravado em cada linha de estatística", () => {
    expect(Number.isInteger(SCOUT_VERSION)).toBe(true);
    expect(SCOUT_VERSION).toBeGreaterThan(0);
  });
});
