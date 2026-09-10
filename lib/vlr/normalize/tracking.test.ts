import { describe, expect, it } from "vitest";

import { isCircuitEvent } from "@/lib/vlr/normalize/tracking";

describe("isCircuitEvent", () => {
  it("aceita uma liga regional da VCT, em andamento ou por vir", () => {
    expect(
      isCircuitEvent({ name: "VCT 2026 Pacific: Stage 2", status: "ongoing" }),
    ).toBe(true);
    expect(
      isCircuitEvent({
        name: "VCT 2026 Americas: Stage 1",
        status: "upcoming",
      }),
    ).toBe(true);
  });

  it("aceita Masters e Champions mesmo sem 'VCT' no nome", () => {
    expect(
      isCircuitEvent({ name: "Valorant Champions 2026", status: "upcoming" }),
    ).toBe(true);
    expect(
      isCircuitEvent({ name: "VCT 2026: Masters Toronto", status: "ongoing" }),
    ).toBe(true);
  });

  it("recusa torneios fora do circuito principal", () => {
    expect(
      isCircuitEvent({ name: "Challengers League: Brazil", status: "ongoing" }),
    ).toBe(false);
    expect(
      isCircuitEvent({
        name: "VCT Game Changers Championship",
        status: "upcoming",
      }),
    ).toBe(false);
    expect(
      isCircuitEvent({ name: "VCT Ascension: EMEA", status: "upcoming" }),
    ).toBe(false);
  });

  it("recusa evento já encerrado, mesmo com nome do circuito", () => {
    expect(
      isCircuitEvent({ name: "VCT 2026 EMEA: Stage 2", status: "completed" }),
    ).toBe(false);
  });

  it("recusa status desconhecido", () => {
    expect(
      isCircuitEvent({ name: "VCT 2026 China: Stage 2", status: "unknown" }),
    ).toBe(false);
  });
});
