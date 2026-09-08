// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  hasInternationalEvent,
  internationalMatches,
  qualifiedOrganizations,
} from "@/lib/round/international";
import type { RoundMatch } from "@/lib/round/types";

function match(overrides: Partial<RoundMatch> & { event: string }): RoundMatch {
  return {
    id: overrides.event,
    teamA: "NRG",
    teamB: "LOUD",
    scheduledAt: new Date("2026-09-04T17:00:00Z"),
    status: "upcoming",
    scoreA: null,
    scoreB: null,
    ...overrides,
  };
}

describe("internationalMatches", () => {
  it("filtra só as partidas de Masters/Champions", () => {
    const matches = [
      match({
        event: "Valorant Champions 2026",
        teamA: "LOUD",
        teamB: "FNATIC",
      }),
      match({ event: "VCT 2026: Americas Stage 2" }),
    ];

    expect(internationalMatches(matches)).toHaveLength(1);
    expect(internationalMatches(matches)[0]?.event).toBe(
      "Valorant Champions 2026",
    );
  });
});

describe("hasInternationalEvent", () => {
  it("sem partidas internacionais, false", () => {
    expect(
      hasInternationalEvent([match({ event: "VCT 2026: EMEA Stage 1" })]),
    ).toBe(false);
  });

  it("com ao menos uma, true", () => {
    expect(
      hasInternationalEvent([match({ event: "VCT 2026: Masters Toronto" })]),
    ).toBe(true);
  });

  it("uma partida finished dentro do lookback ainda conta", () => {
    const matches = [
      match({
        event: "Valorant Champions 2026",
        status: "finished",
        scoreA: 2,
        scoreB: 0,
      }),
    ];

    expect(hasInternationalEvent(matches)).toBe(true);
  });
});

describe("qualifiedOrganizations", () => {
  it("dedup dos dois lados de todas as partidas internacionais", () => {
    const matches = [
      match({
        event: "Valorant Champions 2026",
        teamA: "LOUD",
        teamB: "FNATIC",
      }),
      match({ event: "Valorant Champions 2026", teamA: "LOUD", teamB: "DRX" }),
    ];

    expect(qualifiedOrganizations(matches).sort()).toEqual(
      ["DRX", "FNATIC", "LOUD"].sort(),
    );
  });

  it("ignora organizações de partidas regionais", () => {
    const matches = [
      match({
        event: "VCT 2026: Americas Stage 2",
        teamA: "NRG",
        teamB: "LOUD",
      }),
    ];

    expect(qualifiedOrganizations(matches)).toEqual([]);
  });

  it("sem partidas internacionais, lista vazia", () => {
    expect(qualifiedOrganizations([])).toEqual([]);
  });
});
