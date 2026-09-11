import { describe, expect, it } from "vitest";

import {
  formatScore,
  highestScorer,
  lowestScorer,
  SCORE_THRESHOLDS,
  scoreTone,
} from "@/lib/team/score";
import type { RosterSlot } from "@/lib/team/types";

function slot(nickname: string, score: number): RosterSlot {
  return {
    id: nickname.toLowerCase(),
    captain: false,
    warning: null,
    player: {
      id: nickname.toLowerCase(),
      nickname,
      team: "FNATIC",
      agent: "Astra",
      role: "Controlador",
      score,
      priceCents: 5000,
      active: true,
      availability: "available",
      availabilityNote: null,
      region: "emea",
      photoUrl: null,
    },
  };
}

describe("scoreTone", () => {
  it("classifica pelas faixas, incluindo os limites", () => {
    expect(scoreTone(SCORE_THRESHOLDS.positive)).toBe("positive");
    expect(scoreTone(SCORE_THRESHOLDS.positive - 0.1)).toBe("neutral");
    expect(scoreTone(SCORE_THRESHOLDS.neutral)).toBe("neutral");
    expect(scoreTone(SCORE_THRESHOLDS.neutral - 0.1)).toBe("negative");
  });
});

describe("formatScore", () => {
  it("mantém sempre uma casa decimal", () => {
    expect(formatScore(9)).toBe("9.0");
    expect(formatScore(24.66)).toBe("24.7");
    expect(formatScore(0)).toBe("0.0");
  });
});

describe("highestScorer / lowestScorer", () => {
  const roster = [slot("Boaster", 24.6), slot("Sacy", 9.4)];

  it("encontra os extremos da escalação", () => {
    expect(highestScorer(roster)?.nickname).toBe("Boaster");
    expect(lowestScorer(roster)?.nickname).toBe("Sacy");
  });

  it("ignora as vagas vazias", () => {
    const withGap = [
      { id: null, player: null, captain: false, warning: null },
      ...roster,
    ];

    expect(highestScorer(withGap)?.nickname).toBe("Boaster");
    expect(lowestScorer(withGap)?.nickname).toBe("Sacy");
  });

  it("devolve null quando não há ninguém escalado", () => {
    const empty = [{ id: null, player: null, captain: false, warning: null }];

    expect(highestScorer(empty)).toBeNull();
    expect(lowestScorer(empty)).toBeNull();
  });
});
