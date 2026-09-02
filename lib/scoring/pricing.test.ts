import { describe, expect, it } from "vitest";

import {
  MAX_SWING_RATIO,
  MIN_PRICE_CENTS,
  PRICE_PER_POINT_CENTS,
  averagePoints,
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
