import { describe, expect, it } from "vitest";

import {
  MAX_PATRIMONY_CENTS,
  STARTING_BUDGET_CENTS,
  budgetTrimCents,
  patrimonyCents,
  trimmedBalanceCents,
} from "@/lib/market/budget";
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from "@/lib/scoring/pricing";
import { ROSTER_SIZE } from "@/lib/team/types";

/**
 * Teste de guarda das constantes (plano 20): as quatro invariantes da
 * aritmética que sustenta as Decisões 1 e 3, escritas como asserção — mexer
 * num número sem mexer no outro quebra o build.
 */
describe("invariantes do orçamento", () => {
  it("um jogador nunca consome todo o dinheiro: MAX_PRICE_CENTS <= 30% do orçamento", () => {
    expect(MAX_PRICE_CENTS).toBeLessThanOrEqual(STARTING_BUDGET_CENTS * 0.3);
  });

  it("...nem com o patrimônio no teto: MAX_PRICE_CENTS <= teto / 4", () => {
    expect(MAX_PRICE_CENTS).toBeLessThanOrEqual(MAX_PATRIMONY_CENTS / 4);
  });

  it("sempre dá para completar 5 vagas mesmo escalando o mais caro", () => {
    const cheapestFour = (ROSTER_SIZE - 1) * MIN_PRICE_CENTS;
    expect(MAX_PRICE_CENTS + cheapestFour).toBeLessThanOrEqual(
      STARTING_BUDGET_CENTS,
    );
  });

  it("os 5 jogadores mais caros da liga nunca cabem no teto", () => {
    expect(MAX_PRICE_CENTS * ROSTER_SIZE).toBeGreaterThan(MAX_PATRIMONY_CENTS);
  });
});

describe("MAX_PATRIMONY_CENTS", () => {
  it("bate com o literal do CHECK fantasy_team_balance_range (db/schema/fantasy-teams.ts)", () => {
    // Um CHECK do Postgres não aceita parâmetro de query — o literal lá é
    // hardcoded. Este teste é a rede que pega a dessincronia se um dia só um
    // lado mudar.
    expect(MAX_PATRIMONY_CENTS).toBe(36_000);
  });
});

describe("patrimonyCents", () => {
  it("soma saldo e valor do elenco", () => {
    expect(
      patrimonyCents({ balanceCents: 1_000, squadValueCents: 2_000 }),
    ).toBe(3_000);
  });
});

describe("budgetTrimCents / trimmedBalanceCents", () => {
  it("patrimônio dentro do teto: não corta nada", () => {
    const args = { balanceCents: 5_000, squadValueCents: 20_000 };
    expect(budgetTrimCents(args)).toBe(0);
    expect(trimmedBalanceCents(args)).toBe(5_000);
  });

  it("patrimônio exatamente no teto: não corta nada", () => {
    const args = { balanceCents: 6_000, squadValueCents: 30_000 }; // = 36.000
    expect(budgetTrimCents(args)).toBe(0);
  });

  it("acima do teto: corta só o excedente do caixa", () => {
    // Patrimônio 37.000, teto 36.000 → excedente 1.000.
    const args = { balanceCents: 5_000, squadValueCents: 32_000 };
    expect(budgetTrimCents(args)).toBe(1_000);
    expect(trimmedBalanceCents(args)).toBe(4_000);
  });

  it("elenco sozinho maior que o teto: zera o caixa e não fica negativo", () => {
    const args = { balanceCents: 3_000, squadValueCents: 40_000 };
    expect(trimmedBalanceCents(args)).toBe(0);
    expect(budgetTrimCents(args)).toBe(3_000);
    expect(trimmedBalanceCents(args)).toBeGreaterThanOrEqual(0);
  });
});
