import { describe, expect, it } from "vitest";

import {
  rankingRegionTabs,
  resolveRankingRegion,
} from "@/lib/championship/regions";
import { LEAGUE_REGIONS, TEAM_REGIONS } from "@/lib/round/regions";
import type { ChampionshipSummary } from "@/lib/championship/types";

function championship(
  overrides: Partial<ChampionshipSummary> & { id: string },
): ChampionshipSummary {
  return {
    name: overrides.id,
    ownerId: "owner",
    region: "americas",
    memberCount: 1,
    ...overrides,
  };
}

describe("resolveRankingRegion", () => {
  it("com ?c= de um campeonato de EMEA, a região é EMEA mesmo com fallback Americas", () => {
    const emea = championship({ id: "emea-1", region: "emea" });

    const region = resolveRankingRegion({
      championships: [emea],
      requested: emea,
      explicit: null,
      fallback: "americas",
    });

    expect(region).toBe("emea");
  });

  it("?region= explícito vence o fallback mesmo sem campeonato nessa região", () => {
    const region = resolveRankingRegion({
      championships: [championship({ id: "a", region: "americas" })],
      requested: undefined,
      explicit: "china",
      fallback: "americas",
    });

    expect(region).toBe("china");
  });

  it("sem ?c= nem ?region=, cai no fallback quando ele tem campeonato", () => {
    const region = resolveRankingRegion({
      championships: [championship({ id: "a", region: "americas" })],
      requested: undefined,
      explicit: null,
      fallback: "americas",
    });

    expect(region).toBe("americas");
  });

  it("fallback sem campeonato cai na primeira região com campeonato (ordem de TEAM_REGIONS)", () => {
    const region = resolveRankingRegion({
      championships: [
        championship({ id: "p", region: "pacific" }),
        championship({ id: "e", region: "emea" }),
      ],
      requested: undefined,
      explicit: null,
      fallback: "americas",
    });

    // EMEA vem antes de Pacific em TEAM_REGIONS.
    expect(region).toBe("emea");
  });

  it("usuário sem campeonato nenhum devolve o fallback", () => {
    const region = resolveRankingRegion({
      championships: [],
      requested: undefined,
      explicit: null,
      fallback: "americas",
    });

    expect(region).toBe("americas");
  });
});

describe("rankingRegionTabs", () => {
  it("sem campeonato fora de `available`, devolve `available` como está", () => {
    const tabs = rankingRegionTabs(
      [championship({ id: "a", region: "americas" })],
      LEAGUE_REGIONS,
    );

    expect(tabs).toEqual(LEAGUE_REGIONS);
  });

  it("inclui 'international' quando há campeonato lá, mesmo fora de `available`", () => {
    const tabs = rankingRegionTabs(
      [championship({ id: "i", region: "international" })],
      LEAGUE_REGIONS,
    );

    expect(tabs).toEqual(TEAM_REGIONS);
  });

  it("não duplica uma região que já está em `available`", () => {
    const tabs = rankingRegionTabs(
      [championship({ id: "a", region: "americas" })],
      TEAM_REGIONS,
    );

    expect(tabs).toEqual(TEAM_REGIONS);
  });
});
