import { describe, expect, it } from "vitest";

import {
  MAX_SWING_RATIO,
  MIN_PRICE_CENTS,
  PRICE_PER_POINT_CENTS,
  averagePoints,
  dampingFactor,
  nextPriceCents,
  priceDeltaCents,
} from "@/lib/scoring/pricing";

describe("averagePoints", () => {
  it("calcula a média das pontuações", () => {
    expect(averagePoints([10, 20, 30])).toBe(20);
  });

  it("devolve 0 para uma lista vazia, nunca NaN", () => {
    expect(averagePoints([])).toBe(0);
  });
});

describe("priceDeltaCents", () => {
  it("pontuar acima da média valoriza", () => {
    const delta = priceDeltaCents({
      priceCents: 10_000,
      points: 15,
      averagePoints: 10,
    });
    expect(delta).toBe(5 * PRICE_PER_POINT_CENTS);
    expect(delta).toBeGreaterThan(0);
  });

  it("pontuar abaixo da média desvaloriza", () => {
    const delta = priceDeltaCents({
      priceCents: 10_000,
      points: 5,
      averagePoints: 10,
    });
    expect(delta).toBe(-5 * PRICE_PER_POINT_CENTS);
    expect(delta).toBeLessThan(0);
  });

  it("pontuar exatamente a média dá delta 0", () => {
    expect(
      priceDeltaCents({ priceCents: 10_000, points: 10, averagePoints: 10 }),
    ).toBe(0);
  });

  it("o teto de 15% limita uma pontuação absurda", () => {
    const priceCents = 10_000;
    const delta = priceDeltaCents({
      priceCents,
      points: 1000,
      averagePoints: 0,
    });
    expect(delta).toBe(Math.round(priceCents * MAX_SWING_RATIO));
  });

  it("o teto de 15% também limita uma desvalorização absurda", () => {
    const priceCents = 10_000;
    const delta = priceDeltaCents({
      priceCents,
      points: 0,
      averagePoints: 1000,
    });
    expect(delta).toBe(-Math.round(priceCents * MAX_SWING_RATIO));
  });

  it("o piso MIN_PRICE_CENTS segura o preço acima de zero", () => {
    const priceCents = MIN_PRICE_CENTS + 10;
    const delta = priceDeltaCents({
      priceCents,
      points: 0,
      averagePoints: 1000,
    });
    expect(priceCents + delta).toBe(MIN_PRICE_CENTS);
    expect(priceCents + delta).toBeGreaterThan(0);
  });

  it("invariante: nextPriceCents(x) - x === priceDeltaCents(x)", () => {
    const args = { priceCents: 12_345, points: 8, averagePoints: 3 };
    expect(nextPriceCents(args) - args.priceCents).toBe(priceDeltaCents(args));
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

describe("priceDeltaCents com amortecimento", () => {
  const base = { priceCents: 100_000, points: 15, averagePoints: 10 };

  it("a estreia move um quarto do que moveria um veterano", () => {
    const veteran = priceDeltaCents({ ...base, gamesPlayed: 10 });
    const rookie = priceDeltaCents({ ...base, gamesPlayed: 0 });
    expect(rookie).toBe(Math.round(veteran * 0.25));
  });

  it("omitir gamesPlayed não amortece — o comportamento anterior é o default", () => {
    expect(priceDeltaCents(base)).toBe(
      priceDeltaCents({ ...base, gamesPlayed: 99 }),
    );
  });

  it("amortecer não inverte o sinal da variação", () => {
    expect(priceDeltaCents({ ...base, gamesPlayed: 0 })).toBeGreaterThan(0);
    expect(
      priceDeltaCents({ ...base, points: 0, gamesPlayed: 0 }),
    ).toBeLessThan(0);
  });

  it("invariante preservada: nextPriceCents(x) - x === priceDeltaCents(x)", () => {
    const args = { ...base, gamesPlayed: 1 };
    expect(nextPriceCents(args) - args.priceCents).toBe(priceDeltaCents(args));
  });

  it("o teto de 15% continua valendo depois do amortecimento", () => {
    const priceCents = 10_000;
    const delta = priceDeltaCents({
      priceCents,
      points: 10_000,
      averagePoints: 0,
      gamesPlayed: 0,
    });
    expect(delta).toBe(Math.round(priceCents * MAX_SWING_RATIO));
  });

  it("o piso MIN_PRICE_CENTS continua valendo depois do amortecimento", () => {
    const priceCents = MIN_PRICE_CENTS + 10;
    const delta = priceDeltaCents({
      priceCents,
      points: 0,
      averagePoints: 10_000,
      gamesPlayed: 0,
    });
    expect(priceCents + delta).toBe(MIN_PRICE_CENTS);
  });
});
