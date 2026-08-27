import { describe, expect, it } from "vitest";

import { sortMarketCandidates } from "@/lib/market/ordering";
import type { SubstitutionContext } from "@/lib/market/eligibility";
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
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<SubstitutionContext> = {},
): SubstitutionContext {
  return {
    marketOpen: true,
    balanceCents: 10_000,
    outgoing: null,
    rosteredPlayerIds: [],
    ...overrides,
  };
}

describe("sortMarketCandidates", () => {
  it("ordena do mais barato para o mais caro", () => {
    const candidates = [
      makePlayer({ id: "caro", nickname: "Caro", priceCents: 3000 }),
      makePlayer({ id: "barato", nickname: "Barato", priceCents: 1000 }),
      makePlayer({ id: "medio", nickname: "Medio", priceCents: 2000 }),
    ];

    const sorted = sortMarketCandidates(candidates, makeContext());

    expect(sorted.map((p) => p.nickname)).toEqual(["Barato", "Medio", "Caro"]);
  });

  it("empurra quem está bloqueado para o fim, mantendo a ordem de preço", () => {
    const candidates = [
      makePlayer({
        id: "bloqueado-barato",
        nickname: "BloqueadoBarato",
        priceCents: 1000,
        active: false, // bloqueado: player-inactive
      }),
      makePlayer({ id: "livre-caro", nickname: "LivreCaro", priceCents: 3000 }),
      makePlayer({
        id: "livre-barato",
        nickname: "LivreBarato",
        priceCents: 500,
      }),
      makePlayer({
        id: "bloqueado-caro",
        nickname: "BloqueadoCaro",
        priceCents: 9000,
        active: false,
      }),
    ];

    const sorted = sortMarketCandidates(candidates, makeContext());

    expect(sorted.map((p) => p.nickname)).toEqual([
      "LivreBarato",
      "LivreCaro",
      "BloqueadoBarato",
      "BloqueadoCaro",
    ]);
  });

  it("desempata preço igual por nickname", () => {
    const candidates = [
      makePlayer({ id: "z", nickname: "Zeta", priceCents: 1000 }),
      makePlayer({ id: "a", nickname: "Alfa", priceCents: 1000 }),
    ];

    const sorted = sortMarketCandidates(candidates, makeContext());

    expect(sorted.map((p) => p.nickname)).toEqual(["Alfa", "Zeta"]);
  });
});
