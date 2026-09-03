import { describe, expect, it } from "vitest";

import { DEFAULT_CREST } from "@/lib/crest/crest";
import type { RankedStanding } from "@/lib/championship/types";
import {
  IDLE_REFRESH_MS,
  LIVE_REFRESH_MS,
  patrimonyCents,
  patrimonyDeltaCents,
  placementChanges,
  nextMarketClose,
  projectRoundHighlights,
  refreshIntervalMs,
} from "@/lib/home/summary";
import type { HomeSummary } from "@/lib/home/types";
import type {
  LiveRoundScore,
  RoundMatch,
  RoundTeamResult,
} from "@/lib/round/types";

function result(overrides: Partial<RoundTeamResult> = {}): RoundTeamResult {
  return {
    points: 0,
    balanceCents: 10_000,
    squadValueCents: 5_000,
    ...overrides,
  };
}

function standing(
  overrides: Partial<RankedStanding> & { userId: string },
): RankedStanding {
  return {
    userName: overrides.userId,
    username: overrides.userId,
    teamName: `${overrides.userId} FC`,
    crest: DEFAULT_CREST,
    points: 0,
    position: 1,
    isCurrentUser: false,
    ...overrides,
  };
}

function match(overrides: Partial<RoundMatch> = {}): RoundMatch {
  return {
    id: "match-1",
    teamA: "SENTINELS",
    teamB: "FNATIC",
    event: "VCT Americas",
    scheduledAt: new Date("2026-03-12T21:00:00Z"),
    status: "upcoming",
    scoreA: null,
    scoreB: null,
    ...overrides,
  };
}

describe("patrimonyCents", () => {
  it("soma saldo e valor do elenco", () => {
    expect(
      patrimonyCents(result({ balanceCents: 7000, squadValueCents: 3000 })),
    ).toBe(10_000);
  });
});

describe("patrimonyDeltaCents", () => {
  it("devolve null sem rodada anterior", () => {
    expect(patrimonyDeltaCents(result(), null)).toBeNull();
  });

  it("calcula a diferença de patrimônio entre as duas rodadas", () => {
    const current = result({ balanceCents: 8000, squadValueCents: 5000 });
    const previous = result({ balanceCents: 6000, squadValueCents: 5000 });
    expect(patrimonyDeltaCents(current, previous)).toBe(2000);
  });
});

describe("placementChanges", () => {
  it("subiu: previousPosition - currentPosition positivo", () => {
    const current = [standing({ userId: "me", position: 2 })];
    const previous = [standing({ userId: "me", position: 3 })];
    expect(placementChanges(current, previous, "me")).toEqual({
      position: 2,
      memberCount: 1,
      change: 1,
    });
  });

  it("desceu: variação negativa", () => {
    const current = [standing({ userId: "me", position: 4 })];
    const previous = [standing({ userId: "me", position: 2 })];
    expect(placementChanges(current, previous, "me")?.change).toBe(-2);
  });

  it("manteve: variação 0", () => {
    const current = [standing({ userId: "me", position: 1 })];
    const previous = [standing({ userId: "me", position: 1 })];
    expect(placementChanges(current, previous, "me")?.change).toBe(0);
  });

  it("estreou: sem classificação anterior, change é null", () => {
    const current = [standing({ userId: "me", position: 1 })];
    expect(placementChanges(current, null, "me")?.change).toBeNull();
  });

  it("usuário não está na classificação atual: devolve null", () => {
    const current = [standing({ userId: "outro" })];
    expect(placementChanges(current, null, "me")).toBeNull();
  });
});

function liveScore(overrides: Partial<LiveRoundScore> = {}): LiveRoundScore {
  return {
    playerId: "tenz",
    nickname: "TenZ",
    team: "SENTINELS",
    role: "Duelista",
    points: 20,
    priceCents: 100_000,
    gamesPlayed: 10,
    ...overrides,
  };
}

describe("projectRoundHighlights", () => {
  it("sem ninguém pontuado, não inventa destaque", () => {
    expect(projectRoundHighlights([], 5)).toEqual({
      topScorer: null,
      risers: [],
      fallers: [],
    });
  });

  it("o maior pontuador é o de mais pontos na rodada", () => {
    const highlights = projectRoundHighlights(
      [
        liveScore({ playerId: "tenz", nickname: "TenZ", points: 18 }),
        liveScore({ playerId: "aspas", nickname: "aspas", points: 31.25 }),
      ],
      5,
    );

    expect(highlights.topScorer?.nickname).toBe("aspas");
    // Uma casa decimal, como `calculateRound` grava em `player.score`.
    expect(highlights.topScorer?.points).toBe(31.3);
  });

  it("quem ficou acima da média sobe, quem ficou abaixo cai", () => {
    const highlights = projectRoundHighlights(
      [
        liveScore({ playerId: "aspas", nickname: "aspas", points: 40 }),
        liveScore({ playerId: "sacy", nickname: "Sacy", points: 5 }),
      ],
      5,
    );

    expect(highlights.risers.map((mover) => mover.nickname)).toEqual(["aspas"]);
    expect(highlights.fallers.map((mover) => mover.nickname)).toEqual(["Sacy"]);
    expect(highlights.risers[0].priceDeltaCents).toBeGreaterThan(0);
    expect(highlights.fallers[0].priceDeltaCents).toBeLessThan(0);
  });

  it("ninguém aparece nas duas listas: delta zero não é variação", () => {
    const highlights = projectRoundHighlights(
      [
        liveScore({ playerId: "a", points: 10 }),
        liveScore({ playerId: "b", points: 10 }),
      ],
      5,
    );

    expect(highlights.risers).toEqual([]);
    expect(highlights.fallers).toEqual([]);
  });

  it("respeita o limite de cada lista, do maior para o menor", () => {
    const highlights = projectRoundHighlights(
      [
        liveScore({ playerId: "a", nickname: "A", points: 50 }),
        liveScore({ playerId: "b", nickname: "B", points: 40 }),
        liveScore({ playerId: "c", nickname: "C", points: 30 }),
        liveScore({ playerId: "d", nickname: "D", points: 0 }),
      ],
      2,
    );

    expect(highlights.risers.map((mover) => mover.nickname)).toEqual([
      "A",
      "B",
    ]);
  });
});

function summary(overrides: Partial<HomeSummary> = {}): HomeSummary {
  return {
    pendingInvites: [],
    hasFinishedRound: false,
    recap: null,
    nextRound: null,
    upcoming: { matches: [], myOrganizations: [] },
    highlights: null,
    ...overrides,
  };
}

describe("refreshIntervalMs", () => {
  it("tela parada se atualiza devagar", () => {
    expect(refreshIntervalMs(summary())).toBe(IDLE_REFRESH_MS);
  });

  it("partida ao vivo acelera o ciclo", () => {
    const live = summary({
      upcoming: {
        matches: [match({ status: "live" })],
        myOrganizations: [],
      },
    });

    expect(refreshIntervalMs(live)).toBe(LIVE_REFRESH_MS);
  });

  it("rodada em curso já pontuando também acelera", () => {
    const scoring = summary({
      highlights: {
        roundNumber: 7,
        partial: true,
        topScorer: null,
        risers: [],
        fallers: [],
      },
    });

    expect(refreshIntervalMs(scoring)).toBe(LIVE_REFRESH_MS);
  });

  it("rodada fechada não precisa de pressa", () => {
    const closed = summary({
      highlights: {
        roundNumber: 7,
        partial: false,
        topScorer: null,
        risers: [],
        fallers: [],
      },
    });

    expect(refreshIntervalMs(closed)).toBe(IDLE_REFRESH_MS);
  });
});

describe("nextMarketClose", () => {
  const AMERICAS_KICKOFF = new Date("2026-09-03T20:00:00Z");
  const CHAMPIONS_KICKOFF = new Date("2026-09-04T16:00:00Z");

  function week(): RoundMatch[] {
    return [
      match({
        id: "champions",
        event: "Valorant Champions 2026",
        scheduledAt: CHAMPIONS_KICKOFF,
      }),
      match({
        id: "americas",
        event: "VCT 2026: Americas Stage 2",
        scheduledAt: AMERICAS_KICKOFF,
      }),
    ];
  }

  it("fecha uma hora antes do primeiro jogo que ainda não começou", () => {
    const closesAt = nextMarketClose(week(), new Date("2026-09-01T00:00:00Z"));

    expect(closesAt).toEqual(
      new Date(AMERICAS_KICKOFF.getTime() - 60 * 60_000),
    );
  });

  it("passado o primeiro jogo, vale o próximo", () => {
    const closesAt = nextMarketClose(week(), new Date("2026-09-03T21:00:00Z"));

    expect(closesAt).toEqual(
      new Date(CHAMPIONS_KICKOFF.getTime() - 60 * 60_000),
    );
  });

  it("com o mercado do último jogo já fechado, não há próximo", () => {
    expect(
      nextMarketClose(week(), new Date("2026-09-05T00:00:00Z")),
    ).toBeNull();
  });

  it("rodada sem partida não inventa fechamento", () => {
    expect(nextMarketClose([], new Date())).toBeNull();
  });
});
