import { describe, expect, it } from "vitest";

import { DEFAULT_CREST } from "@/lib/crest/crest";
import type { RankedStanding } from "@/lib/championship/types";
import {
  lineupAlerts,
  patrimonyCents,
  patrimonyDeltaCents,
  placementChanges,
  projectRoundHighlights,
} from "@/lib/home/summary";
import type {
  LiveRoundScore,
  RoundMatch,
  RoundTeamResult,
} from "@/lib/round/types";
import type { Player, RosterSlot } from "@/lib/team/types";

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

function player(overrides: Partial<Player> = {}): Player {
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
    ...overrides,
  };
}

function slot(overrides: Partial<RosterSlot> = {}): RosterSlot {
  return { id: "slot-1", player: player(), captain: false, ...overrides };
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

describe("lineupAlerts", () => {
  it("os 5 jogam: fica em silêncio", () => {
    const roster = [slot(), slot({ id: "slot-2" })];
    const matches = [match()];
    expect(lineupAlerts(roster, matches)).toEqual([]);
  });

  it("acusa vaga vazia", () => {
    const roster = [slot({ player: null })];
    expect(lineupAlerts(roster, [])).toEqual([
      { position: 1, message: "A vaga 1 está vazia." },
    ]);
  });

  it("acusa jogador indisponível (banco)", () => {
    const roster = [slot({ player: player({ availability: "bench" }) })];
    expect(lineupAlerts(roster, [match()])).toEqual([
      { position: 1, message: "TenZ não deve jogar (Reserva)." },
    ]);
  });

  it("acusa jogador lesionado com a nota", () => {
    const roster = [
      slot({
        player: player({
          availability: "injured",
          availabilityNote: "Fora por lesão no pulso",
        }),
      }),
    ];
    expect(lineupAlerts(roster, [match()])).toEqual([
      {
        position: 1,
        message: "TenZ não deve jogar (Lesionado): Fora por lesão no pulso.",
      },
    ]);
  });

  it("acusa jogador eliminado", () => {
    const roster = [slot({ player: player({ availability: "eliminated" }) })];
    expect(lineupAlerts(roster, [match()])[0]?.message).toBe(
      "TenZ não deve jogar (Time eliminado).",
    );
  });

  it("acusa organização sem partida na rodada", () => {
    const roster = [slot({ player: player({ team: "LOUD" }) })];
    const matches = [match({ teamA: "SENTINELS", teamB: "FNATIC" })];
    expect(lineupAlerts(roster, matches)).toEqual([
      { position: 1, message: "TenZ (LOUD) não tem partida nesta rodada." },
    ]);
  });

  it("indisponibilidade tem precedência sobre organização sem partida", () => {
    const roster = [
      slot({ player: player({ team: "LOUD", availability: "bench" }) }),
    ];
    const matches = [match({ teamA: "SENTINELS", teamB: "FNATIC" })];
    const alerts = lineupAlerts(roster, matches);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.message).toBe("TenZ não deve jogar (Reserva).");
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
