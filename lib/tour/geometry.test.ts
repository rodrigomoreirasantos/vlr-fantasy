// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  cardPlacement,
  chamferPoints,
  scrollAlignment,
  spotlightRect,
  TALL_TARGET_RATIO,
} from "@/lib/tour/geometry";

const VIEWPORT = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

describe("spotlightRect", () => {
  it("aplica a folga em volta do alvo", () => {
    const target = { top: 100, left: 100, width: 50, height: 20 };
    expect(spotlightRect(target, VIEWPORT, 8)).toEqual({
      top: 92,
      left: 92,
      width: 66,
      height: 36,
    });
  });

  it("recorta a folga na borda da viewport, sem sair dela", () => {
    const target = { top: 0, left: 0, width: 20, height: 20 };
    const rect = spotlightRect(target, VIEWPORT, 8);
    expect(rect.top).toBe(0);
    expect(rect.left).toBe(0);
  });
});

describe("chamferPoints", () => {
  it("devolve 6 pontos", () => {
    const rect = { top: 0, left: 0, width: 100, height: 50 };
    const points = chamferPoints(rect, 12).split(" ");
    expect(points).toHaveLength(6);
    for (const point of points) {
      expect(point).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    }
  });
});

describe("cardPlacement", () => {
  it("sem alvo, centraliza", () => {
    expect(cardPlacement(null, VIEWPORT)).toBe("center");
  });

  it("alvo no topo: o cartão abre abaixo", () => {
    const target = { top: 0, left: 0, width: 100, height: 40 };
    expect(cardPlacement(target, VIEWPORT)).toBe("bottom");
  });

  it("alvo no rodapé: o cartão abre acima", () => {
    const target = { top: 750, left: 0, width: 100, height: 40 };
    expect(cardPlacement(target, VIEWPORT)).toBe("top");
  });

  it("alvo com 90% da altura da tela: o cartão fica 'docked'", () => {
    const target = { top: 0, left: 0, width: 390, height: PHONE.height * 0.9 };
    expect(cardPlacement(target, PHONE)).toBe("docked");
  });
});

describe("scrollAlignment", () => {
  it("um bloco baixo alinha ao centro", () => {
    const target = { top: 500, left: 0, width: 300, height: 40 };
    expect(scrollAlignment(target, VIEWPORT)).toBe("center");
  });

  it("um bloco mais alto que TALL_TARGET_RATIO da viewport alinha ao topo", () => {
    const target = {
      top: 0,
      left: 0,
      width: 300,
      height: VIEWPORT.height * 0.9,
    };
    expect(scrollAlignment(target, VIEWPORT)).toBe("start");
  });

  it("exatamente no limite (TALL_TARGET_RATIO): ainda centraliza", () => {
    const target = {
      top: 0,
      left: 0,
      width: 300,
      height: VIEWPORT.height * TALL_TARGET_RATIO,
    };
    expect(scrollAlignment(target, VIEWPORT)).toBe("center");
  });
});
