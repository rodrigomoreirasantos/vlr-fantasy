import { describe, expect, it } from "vitest";

import {
  CAPTAIN_MULTIPLIER,
  playerContribution,
  teamPoints,
} from "@/lib/scoring/team";

describe("playerContribution", () => {
  it("dobra a pontuação do capitão", () => {
    expect(playerContribution(10, true)).toBe(10 * CAPTAIN_MULTIPLIER);
  });

  it("mantém a pontuação de quem não é capitão", () => {
    expect(playerContribution(10, false)).toBe(10);
  });
});

describe("teamPoints", () => {
  it("soma as cinco vagas, dobrando a do capitão", () => {
    const slots = [
      { player: { score: 10 }, captain: true },
      { player: { score: 5 }, captain: false },
      { player: { score: 8 }, captain: false },
      { player: { score: 2 }, captain: false },
      { player: { score: 1 }, captain: false },
    ];

    expect(teamPoints(slots)).toBe(20 + 5 + 8 + 2 + 1);
  });

  it("sem capitão: soma simples", () => {
    const slots = [
      { player: { score: 10 }, captain: false },
      { player: { score: 5 }, captain: false },
    ];

    expect(teamPoints(slots)).toBe(15);
  });

  it("vaga vazia não soma", () => {
    const slots = [
      { player: { score: 10 }, captain: true },
      { player: null, captain: false },
    ];

    expect(teamPoints(slots)).toBe(20);
  });

  it("time vazio dá 0", () => {
    expect(teamPoints([])).toBe(0);
    expect(
      teamPoints([
        { player: null, captain: false },
        { player: null, captain: false },
      ]),
    ).toBe(0);
  });
});
