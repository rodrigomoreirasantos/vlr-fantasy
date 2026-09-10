// @vitest-environment node
import { describe, expect, it } from "vitest";

import { matchesSearch, normalizeSearchTerm } from "@/lib/market/search";

describe("normalizeSearchTerm", () => {
  it("ignora caixa", () => {
    expect(normalizeSearchTerm("SACY")).toBe("sacy");
  });

  it("remove acento", () => {
    expect(normalizeSearchTerm("Não")).toBe("nao");
  });

  it("tira espaço das pontas, preserva espaço interno", () => {
    expect(normalizeSearchTerm("  less  ")).toBe("less");
  });

  it("é idempotente", () => {
    const once = normalizeSearchTerm("Aspás");
    expect(normalizeSearchTerm(once)).toBe(once);
  });
});

describe("matchesSearch", () => {
  it("termo vazio casa com qualquer nickname", () => {
    expect(matchesSearch("TenZ", "")).toBe(true);
  });

  it("substring no meio do nickname casa (não é só prefixo)", () => {
    expect(matchesSearch("aspas", normalizeSearchTerm("spa"))).toBe(true);
  });

  it("caixa não importa de nenhum dos dois lados", () => {
    expect(matchesSearch("Sacy", normalizeSearchTerm("SACY"))).toBe(true);
  });

  it("acento não importa de nenhum dos dois lados", () => {
    expect(matchesSearch("Não", normalizeSearchTerm("nao"))).toBe(true);
    expect(matchesSearch("nao", normalizeSearchTerm("Não"))).toBe(true);
  });

  it("termo que não existe no nickname não casa", () => {
    expect(matchesSearch("TenZ", normalizeSearchTerm("derke"))).toBe(false);
  });
});
