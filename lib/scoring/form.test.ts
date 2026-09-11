import { describe, expect, it } from "vitest";

import { FORM_WINDOW, formPoints } from "@/lib/scoring/form";

describe("formPoints", () => {
  it("lista vazia devolve null, nunca 0 — ausência não é desempenho ruim", () => {
    expect(formPoints([])).toBeNull();
  });

  it("média das últimas FORM_WINDOW séries, mais recente primeiro", () => {
    // 5 séries: 100, 80, 60, 40, 20 → média 60.
    expect(formPoints([100, 80, 60, 40, 20])).toBe(60);
  });

  it("menos de FORM_WINDOW séries usa o que tem", () => {
    expect(formPoints([30, 10])).toBe(20);
    expect(formPoints([42])).toBe(42);
  });

  it("mais de FORM_WINDOW séries ignora as mais antigas", () => {
    // Só as 5 primeiras (mais recentes) entram: 100,100,100,100,100 → 100.
    // A 6ª (0) fica de fora — se entrasse, a média cairia.
    expect(formPoints([100, 100, 100, 100, 100, 0])).toBe(100);
  });

  it("janela customizada é respeitada", () => {
    expect(formPoints([10, 20, 30, 40], 2)).toBe(15);
  });

  it("FORM_WINDOW é 5 — a janela default", () => {
    expect(FORM_WINDOW).toBe(5);
  });

  it("arredonda para uma casa decimal", () => {
    expect(formPoints([10, 10, 10, 10, 11])).toBe(10.2);
  });
});
