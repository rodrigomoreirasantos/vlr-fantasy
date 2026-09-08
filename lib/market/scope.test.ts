// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  marketScopeFor,
  matchesScope,
  slotWarning,
  type MarketScope,
} from "@/lib/market/scope";
import type { Player } from "@/lib/team/types";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "tenz",
    nickname: "TenZ",
    team: "SENTINELS",
    agent: "Jett",
    role: "Duelista",
    score: 18.2,
    priceCents: 5000,
    active: true,
    availability: "available",
    availabilityNote: null,
    region: "americas",
    ...overrides,
  };
}

describe("marketScopeFor", () => {
  it("região de liga vira escopo por região", () => {
    expect(marketScopeFor("emea", [])).toEqual({
      kind: "region",
      region: "emea",
    });
  });

  it("internacional vira escopo por organizações classificadas", () => {
    expect(marketScopeFor("international", ["LOUD", "FNATIC"])).toEqual({
      kind: "organizations",
      organizations: ["LOUD", "FNATIC"],
    });
  });
});

describe("matchesScope", () => {
  it("kind 'region': casa pela região do jogador", () => {
    const scope: MarketScope = { kind: "region", region: "americas" };

    expect(matchesScope(scope, makePlayer({ region: "americas" }))).toBe(true);
    expect(matchesScope(scope, makePlayer({ region: "emea" }))).toBe(false);
  });

  it("kind 'organizations': casa pela organização do jogador", () => {
    const scope: MarketScope = {
      kind: "organizations",
      organizations: ["SENTINELS", "LOUD"],
    };

    expect(matchesScope(scope, makePlayer({ team: "SENTINELS" }))).toBe(true);
    expect(matchesScope(scope, makePlayer({ team: "FNATIC" }))).toBe(false);
  });

  it("lista de organizações vazia não deixa ninguém passar", () => {
    const scope: MarketScope = { kind: "organizations", organizations: [] };

    expect(matchesScope(scope, makePlayer())).toBe(false);
  });
});

describe("slotWarning", () => {
  it("jogador dentro do escopo não tem alerta", () => {
    const scope: MarketScope = { kind: "region", region: "americas" };

    expect(slotWarning(scope, makePlayer({ region: "americas" }))).toBeNull();
  });

  it("fora da região, alerta 'out-of-region' com a região atual dele", () => {
    const scope: MarketScope = { kind: "region", region: "americas" };

    expect(slotWarning(scope, makePlayer({ region: "emea" }))).toEqual({
      kind: "out-of-region",
      region: "emea",
    });
  });

  it("região ainda não resolvida ('other') não é 'mudou de liga'", () => {
    const scope: MarketScope = { kind: "region", region: "americas" };

    // "other" é o terminal da cascata — "não sei onde ele joga" —, e dizer
    // "Joga em Outros" afirmaria uma transferência que não aconteceu.
    expect(slotWarning(scope, makePlayer({ region: "other" }))).toEqual({
      kind: "unknown-region",
    });
  });

  it("no escopo por organizações, 'other' continua sendo 'não classificado'", () => {
    const scope: MarketScope = {
      kind: "organizations",
      organizations: ["LOUD"],
    };

    expect(
      slotWarning(scope, makePlayer({ team: "FNATIC", region: "other" })),
    ).toEqual({ kind: "not-qualified" });
  });

  it("fora das organizações classificadas, alerta 'not-qualified'", () => {
    const scope: MarketScope = {
      kind: "organizations",
      organizations: ["LOUD"],
    };

    expect(slotWarning(scope, makePlayer({ team: "FNATIC" }))).toEqual({
      kind: "not-qualified",
    });
  });
});
