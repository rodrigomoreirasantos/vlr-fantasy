import { describe, expect, it } from "vitest";

import {
  centsToCredits,
  creditsToCents,
  formatCredits,
  formatCreditsDelta,
} from "@/lib/market/money";

describe("formatCredits", () => {
  it("formata sempre com uma casa decimal", () => {
    expect(formatCredits(14820)).toBe("148.2");
    expect(formatCredits(20000)).toBe("200.0");
    expect(formatCredits(0)).toBe("0.0");
  });
});

describe("creditsToCents / centsToCredits", () => {
  it("faz ida e volta sem perder precisão", () => {
    expect(centsToCredits(creditsToCents(148.2))).toBeCloseTo(148.2);
    expect(creditsToCents(centsToCredits(14820))).toBe(14820);
  });

  it("arredonda créditos fracionários para o centavo mais próximo", () => {
    expect(creditsToCents(148.005)).toBe(14801);
  });
});

describe("formatCreditsDelta", () => {
  it("prefixa valores positivos com '+'", () => {
    expect(formatCreditsDelta(1250)).toBe("+12.5");
  });

  it("prefixa valores negativos com o sinal de menos tipográfico", () => {
    expect(formatCreditsDelta(-1250)).toBe("−12.5");
  });

  it("trata zero como positivo", () => {
    expect(formatCreditsDelta(0)).toBe("+0.0");
  });
});
