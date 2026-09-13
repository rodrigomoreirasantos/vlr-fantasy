import { describe, expect, it } from "vitest";

import {
  DEBUT_PRICE_CENTS,
  MAX_PRICE_CENTS,
  MAX_SWING_RATIO,
  MIN_PRICE_CENTS,
  PRICE_SENSITIVITY_PER_POINT,
  dampingFactor,
  expectedSeriesPoints,
  nextPriceCents,
  priceDeltaCents,
  targetPriceCents,
} from "@/lib/scoring/pricing";

describe("MIN_PRICE_CENTS / MAX_PRICE_CENTS", () => {
  it("batem com os literais do CHECK player_price_cents_range (db/schema/players.ts)", () => {
    // Um CHECK do Postgres não aceita parâmetro de query — os literais lá
    // são hardcoded. Este teste é a rede que pega a dessincronia se algum
    // dia um lado mudar sem o outro.
    expect(MIN_PRICE_CENTS).toBe(2_000);
    expect(MAX_PRICE_CENTS).toBe(9_000);
  });
});

describe("targetPriceCents", () => {
  it("bate a tabela de percentis reais do circuito (fato 9, plano 20)", () => {
    // forma (pts/série) → preço, régua `20,0 + 0,875 × (forma − 20)`.
    expect(targetPriceCents(22.9)).toBe(2_250); // p10 → 22,5
    expect(targetPriceCents(37.2)).toBe(3_510); // p25 → 35,1
    expect(targetPriceCents(52.1)).toBe(4_810); // p50 → 48,1
    expect(targetPriceCents(66.0)).toBe(6_030); // p75 → 60,3
    expect(targetPriceCents(80.2)).toBe(7_270); // p90 → 72,7
    expect(targetPriceCents(103.7)).toBe(MAX_PRICE_CENTS); // p99 → teto
  });

  it("nunca sai da faixa [MIN, MAX]", () => {
    expect(targetPriceCents(-50)).toBe(MIN_PRICE_CENTS);
    expect(targetPriceCents(0)).toBe(MIN_PRICE_CENTS);
    expect(targetPriceCents(20)).toBe(MIN_PRICE_CENTS);
    expect(targetPriceCents(100)).toBe(MAX_PRICE_CENTS);
    expect(targetPriceCents(500)).toBe(MAX_PRICE_CENTS);
  });

  it("forma null (sem histórico) puxa para o preço de estreia", () => {
    expect(targetPriceCents(null)).toBe(DEBUT_PRICE_CENTS);
  });
});

describe("expectedSeriesPoints", () => {
  it("20,0 cr promete 20 pts, 90,0 cr promete 100 pts (a régua de verdade, plano 26)", () => {
    expect(expectedSeriesPoints(MIN_PRICE_CENTS)).toBe(20);
    expect(expectedSeriesPoints(MAX_PRICE_CENTS)).toBe(100);
  });

  it("48,0 cr promete 52 pts — o exemplo do jogador mediano da conta do plano", () => {
    expect(expectedSeriesPoints(4_800)).toBeCloseTo(52, 5);
  });

  it("é a inversa exata de targetPriceCents dentro da faixa de forma", () => {
    expect(expectedSeriesPoints(targetPriceCents(60))).toBeCloseTo(60, 0);
  });
});

describe("priceDeltaCents", () => {
  it("a tabela de exemplos da seção 'A conta que sustenta as suposições' (plano 26)", () => {
    // 90,0 cr (promete 100), média 50 na rodada → desvio -50 → -20% → limitado a -10% → -900.
    expect(
      priceDeltaCents({ priceCents: 9_000, roundPoints: 50, series: 1 }),
    ).toBe(-900);

    // 90,0 cr, média 120 → desvio +20 → +8%, mas o preço já está no teto → 0.
    expect(
      priceDeltaCents({ priceCents: 9_000, roundPoints: 120, series: 1 }),
    ).toBe(0);

    // 48,0 cr (promete 52), média 70 → desvio +18 → +7,2% → +345,6 → passo de 10 → 350.
    expect(
      priceDeltaCents({ priceCents: 4_800, roundPoints: 70, series: 1 }),
    ).toBe(350);

    // 48,0 cr, média 30 → desvio -22 → -8,8% → -422,4 → passo de 10 → -420.
    expect(
      priceDeltaCents({ priceCents: 4_800, roundPoints: 30, series: 1 }),
    ).toBe(-420);

    // 25,0 cr (promete 25,7), média 60 → desvio +34,3 → +13,7%, limitado a +10% → +250.
    expect(
      priceDeltaCents({ priceCents: 2_500, roundPoints: 60, series: 1 }),
    ).toBe(250);

    // 20,0 cr (piso, promete 20), média 5 → desvio -15 → -6%, mas já está no piso → 0.
    expect(
      priceDeltaCents({ priceCents: 2_000, roundPoints: 5, series: 1 }),
    ).toBe(0);
  });

  it("series 0 (não jogou) dá delta 0, mesmo com roundPoints alto", () => {
    expect(
      priceDeltaCents({ priceCents: 5_000, roundPoints: 999, series: 0 }),
    ).toBe(0);
  });

  it("a mesma soma em 2 séries vale metade do desvio de 1 série (média por série)", () => {
    const oneMap = priceDeltaCents({
      priceCents: 4_800,
      roundPoints: 70,
      series: 1,
    });
    const twoMaps = priceDeltaCents({
      priceCents: 4_800,
      roundPoints: 140,
      series: 2,
    });
    expect(twoMaps).toBe(oneMap);
  });

  it("o delta nunca passa de MAX_SWING_RATIO do preço atual, arredondado", () => {
    for (const priceCents of [MIN_PRICE_CENTS, 4_800, MAX_PRICE_CENTS]) {
      for (const roundPoints of [0, 50, 500]) {
        const delta = priceDeltaCents({ priceCents, roundPoints, series: 1 });
        expect(Math.abs(delta)).toBeLessThanOrEqual(
          Math.round((priceCents * MAX_SWING_RATIO) / 10) * 10 + 10,
        );
      }
    }
  });

  it("o preço final fica sempre em [MIN_PRICE_CENTS, MAX_PRICE_CENTS]", () => {
    for (const priceCents of [MIN_PRICE_CENTS, 4_800, MAX_PRICE_CENTS]) {
      for (const roundPoints of [-100, 0, 500]) {
        const next = nextPriceCents({ priceCents, roundPoints, series: 1 });
        expect(next).toBeGreaterThanOrEqual(MIN_PRICE_CENTS);
        expect(next).toBeLessThanOrEqual(MAX_PRICE_CENTS);
      }
    }
  });

  it("jogo abaixo do prometido nunca dá delta positivo", () => {
    const priceCents = 4_800; // promete 52
    const delta = priceDeltaCents({ priceCents, roundPoints: 30, series: 1 }); // faz 30
    expect(delta).toBeLessThanOrEqual(0);
  });

  it("jogo acima do prometido nunca dá delta negativo", () => {
    const priceCents = 4_800; // promete 52
    const delta = priceDeltaCents({ priceCents, roundPoints: 70, series: 1 }); // faz 70
    expect(delta).toBeGreaterThanOrEqual(0);
  });

  it("invariante: nextPriceCents(x) - x.priceCents === priceDeltaCents(x)", () => {
    const args = { priceCents: 5_230, roundPoints: 61.4, series: 1, gamesPlayed: 2 };
    expect(nextPriceCents(args) - args.priceCents).toBe(priceDeltaCents(args));
  });

  it("gamesPlayed 0 (estreia) dá 25% da variação de um veterano", () => {
    const args = { priceCents: 4_800, roundPoints: 70, series: 1 };
    const veteran = priceDeltaCents({ ...args, gamesPlayed: 10 });
    const rookie = priceDeltaCents({ ...args, gamesPlayed: 0 });
    expect(rookie).toBe(Math.round((veteran * 0.25) / 10) * 10);
  });

  it("omitir gamesPlayed não amortece — o comportamento default", () => {
    const args = { priceCents: 4_800, roundPoints: 70, series: 1 };
    expect(priceDeltaCents(args)).toBe(
      priceDeltaCents({ ...args, gamesPlayed: 99 }),
    );
  });
});

describe("PRICE_SENSITIVITY_PER_POINT / MAX_SWING_RATIO", () => {
  it("os literais do plano 26: 0,4%/pt e ±10% por rodada", () => {
    expect(PRICE_SENSITIVITY_PER_POINT).toBe(0.004);
    expect(MAX_SWING_RATIO).toBe(0.1);
  });
});

describe("dampingFactor", () => {
  it("sobe em rampa nas três primeiras rodadas e satura em 1", () => {
    expect(dampingFactor(0)).toBe(0.25);
    expect(dampingFactor(1)).toBe(0.5);
    expect(dampingFactor(2)).toBe(0.75);
    expect(dampingFactor(3)).toBe(1);
    expect(dampingFactor(40)).toBe(1);
  });

  it("um gamesPlayed negativo cai no fator da estreia, nunca em NaN", () => {
    expect(dampingFactor(-1)).toBe(0.25);
  });
});
