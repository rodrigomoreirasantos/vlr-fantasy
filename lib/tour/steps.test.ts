// @vitest-environment node
import { describe, expect, it } from "vitest";

import { MAX_SWING_RATIO } from "@/lib/scoring/pricing";
import { CAPTAIN_MULTIPLIER } from "@/lib/scoring/team";
import { TOUR_STEPS, type TourRoute } from "@/lib/tour/steps";

const ROUTES: readonly TourRoute[] = ["/home", "/my-team", "/ranking", "/profile"];

describe("TOUR_STEPS", () => {
  it("são 13 passos", () => {
    expect(TOUR_STEPS).toHaveLength(13);
  });

  it("cada passo tem um id único", () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("título tem no máximo 28 caracteres — nada de textão", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeLessThanOrEqual(28);
    }
  });

  it("texto tem no máximo 120 caracteres — uma ideia por passo", () => {
    for (const step of TOUR_STEPS) {
      expect(step.body.length).toBeLessThanOrEqual(120);
    }
  });

  it("só o primeiro passo (convite) não tem rota nem alvo", () => {
    const [first, ...rest] = TOUR_STEPS;
    expect(first.route).toBeNull();
    expect(first.target).toBeNull();

    for (const step of rest) {
      expect(step.route).not.toBeNull();
      expect(step.target).not.toBeNull();
    }
  });

  it("toda rota pertence às quatro abas", () => {
    for (const step of TOUR_STEPS) {
      if (step.route !== null) {
        expect(ROUTES).toContain(step.route);
      }
    }
  });

  it("as rotas são contíguas — o tour não volta a uma aba já visitada", () => {
    const routes = TOUR_STEPS.map((step) => step.route).filter(
      (route): route is TourRoute => route !== null,
    );
    const visited = new Set<TourRoute>();
    let current: TourRoute | null = null;

    for (const route of routes) {
      if (route !== current) {
        // Trocou de aba: não pode ser uma aba já visitada antes.
        expect(visited.has(route)).toBe(false);
        visited.add(route);
        current = route;
      }
    }
  });

  it("o passo de fechamento do mercado cita '1h' e tem reserva", () => {
    const step = TOUR_STEPS.find((row) => row.id === "fechamento-mercado");
    expect(step).toBeDefined();
    expect(step!.body).toContain("1h");
    expect(step!.fallback).toBe("proximos-jogos");
  });

  it("o passo do capitão cita o multiplicador de verdade", () => {
    const step = TOUR_STEPS.find((row) => row.id === "capitao");
    expect(step!.body).toContain(`${CAPTAIN_MULTIPLIER}×`);
  });

  it("o passo do orçamento cita o limite de variação por rodada de verdade", () => {
    const step = TOUR_STEPS.find((row) => row.id === "orcamento");
    expect(step!.body).toContain(`${MAX_SWING_RATIO * 100}%`);
  });

  it("nenhum texto liga 'saldo' a 'pontos' — pontuar não muda o saldo", () => {
    for (const step of TOUR_STEPS) {
      const text = step.body.toLowerCase();
      if (text.includes("saldo")) {
        expect(text).not.toContain("pontos");
      }
    }
  });
});
