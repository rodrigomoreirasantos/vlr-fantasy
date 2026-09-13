import { describe, expect, it } from "vitest";

import {
  DREAM_TEAM_CENTS,
  STARTING_BUDGET_CENTS,
  dreamTeamGapCents,
  patrimonyCents,
  squadValuationCents,
} from "@/lib/market/budget";
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from "@/lib/scoring/pricing";
import { ROSTER_SIZE } from "@/lib/team/types";

/**
 * Teste de guarda das constantes (plano 26): as invariantes da aritmética
 * que sustentam as Suposições S3/S4/S6, escritas como asserção — mexer num
 * número sem mexer no outro quebra o build.
 */
describe("invariantes do orçamento", () => {
  it("os 5 jogadores mais caros não cabem no orçamento inicial", () => {
    expect(DREAM_TEAM_CENTS).toBeGreaterThan(STARTING_BUDGET_CENTS);
  });

  it("...mas o começo não frustra: pelo menos 60% do time dos sonhos", () => {
    expect(STARTING_BUDGET_CENTS).toBeGreaterThanOrEqual(
      0.6 * DREAM_TEAM_CENTS,
    );
  });

  it("sempre dá para completar 5 vagas mesmo escalando o mais caro", () => {
    const cheapestFour = (ROSTER_SIZE - 1) * MIN_PRICE_CENTS;
    expect(MAX_PRICE_CENTS + cheapestFour).toBeLessThanOrEqual(
      STARTING_BUDGET_CENTS,
    );
  });

  it("DREAM_TEAM_CENTS é exatamente 5 × MAX_PRICE_CENTS", () => {
    expect(DREAM_TEAM_CENTS).toBe(ROSTER_SIZE * MAX_PRICE_CENTS);
  });
});

describe("patrimonyCents", () => {
  it("soma saldo e valor do elenco", () => {
    expect(
      patrimonyCents({ balanceCents: 1_000, squadValueCents: 2_000 }),
    ).toBe(3_000);
  });
});

describe("dreamTeamGapCents", () => {
  it("patrimônio abaixo do time dos sonhos: falta a diferença", () => {
    expect(
      dreamTeamGapCents({ balanceCents: 10_000, squadValueCents: 20_000 }),
    ).toBe(DREAM_TEAM_CENTS - 30_000);
  });

  it("patrimônio igual ou acima do time dos sonhos: nunca negativo", () => {
    expect(
      dreamTeamGapCents({
        balanceCents: DREAM_TEAM_CENTS,
        squadValueCents: 0,
      }),
    ).toBe(0);
    expect(
      dreamTeamGapCents({
        balanceCents: DREAM_TEAM_CENTS,
        squadValueCents: 100_000,
      }),
    ).toBe(0);
  });
});

describe("squadValuationCents", () => {
  it("soma positivos e negativos das vagas ocupadas", () => {
    expect(
      squadValuationCents([
        { priceBeforeCents: 5_000, priceAfterCents: 5_350 }, // +350
        { priceBeforeCents: 9_000, priceAfterCents: 8_100 }, // -900
        { priceBeforeCents: 2_000, priceAfterCents: 2_000 }, // 0
      ]),
    ).toBe(-550);
  });

  it("elenco sem nenhuma vaga ocupada soma 0", () => {
    expect(squadValuationCents([])).toBe(0);
  });
});
