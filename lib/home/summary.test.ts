// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DEFAULT_CREST } from "@/lib/crest/crest";
import type { RankedStanding } from "@/lib/championship/types";
import {
  highlightsFor,
  IDLE_REFRESH_MS,
  LIVE_REFRESH_MS,
  patrimonyCents,
  patrimonyDeltaCents,
  placementChanges,
  projectRoundHighlights,
  refreshIntervalMs,
  pendingRegions,
} from "@/lib/home/summary";
import type { HomeSummary, RoundHighlights } from "@/lib/home/types";
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
    event: "VCT 2026: Americas Stage 2",
    ...overrides,
  };
}

describe("projectRoundHighlights", () => {
  it("sem ninguém pontuado, não inventa destaque", () => {
    expect(projectRoundHighlights([])).toEqual({ scorers: [], movers: [] });
  });

  it("ordena os pontuadores do maior para o menor", () => {
    const { scorers } = projectRoundHighlights([
      liveScore({ playerId: "tenz", nickname: "TenZ", points: 18 }),
      liveScore({ playerId: "aspas", nickname: "aspas", points: 31.25 }),
    ]);

    expect(scorers.map((row) => row.nickname)).toEqual(["aspas", "TenZ"]);
    // Uma casa decimal, como `calculateRound` grava em `player.score`.
    expect(scorers[0]!.points).toBe(31.3);
  });

  it("quem ficou acima da média sobe, quem ficou abaixo cai", () => {
    const { movers } = projectRoundHighlights([
      liveScore({ playerId: "aspas", nickname: "aspas", points: 40 }),
      liveScore({ playerId: "sacy", nickname: "Sacy", points: 5 }),
    ]);

    const bySacy = movers.find((row) => row.nickname === "Sacy")!;
    const byAspas = movers.find((row) => row.nickname === "aspas")!;

    expect(byAspas.priceDeltaCents).toBeGreaterThan(0);
    expect(bySacy.priceDeltaCents).toBeLessThan(0);
  });

  it("carrega a região do campeonato em que cada um jogou", () => {
    const { scorers, movers } = projectRoundHighlights([
      liveScore({ playerId: "a", event: "VCT 2026: Pacific Stage 1" }),
    ]);

    expect(scorers[0]!.region).toBe("pacific");
    expect(movers[0]!.region).toBe("pacific");
  });

  it("rodada de seed, sem campeonato, cai em 'other' — nunca numa região inventada", () => {
    const { scorers } = projectRoundHighlights([
      liveScore({ playerId: "a", event: null }),
    ]);

    expect(scorers[0]!.region).toBe("other");
  });
});

function highlights(overrides: Partial<RoundHighlights> = {}): RoundHighlights {
  return {
    partial: false,
    scorers: [],
    movers: [],
    pending: [],
    ...overrides,
  };
}

describe("highlightsFor", () => {
  const data = highlights({
    scorers: [
      {
        playerId: "a",
        nickname: "A",
        team: "NRG",
        role: "Duelista",
        points: 50,
        region: "americas",
      },
      {
        playerId: "b",
        nickname: "B",
        team: "FNATIC",
        role: "Duelista",
        points: 80,
        region: "emea",
      },
    ],
    movers: [
      {
        playerId: "a",
        nickname: "A",
        team: "NRG",
        role: "Duelista",
        priceDeltaCents: 500,
        region: "americas",
      },
      {
        playerId: "b",
        nickname: "B",
        team: "FNATIC",
        role: "Duelista",
        priceDeltaCents: -800,
        region: "emea",
      },
      {
        playerId: "c",
        nickname: "C",
        team: "LOUD",
        role: "Duelista",
        priceDeltaCents: 900,
        region: "americas",
      },
    ],
  });

  it("sem região, agrega o circuito inteiro", () => {
    const { topScorer, risers, fallers } = highlightsFor(data, null, 5);

    expect(topScorer?.nickname).toBe("B");
    expect(risers.map((row) => row.nickname)).toEqual(["C", "A"]);
    expect(fallers.map((row) => row.nickname)).toEqual(["B"]);
  });

  it("com região, só quem jogou nela", () => {
    const { topScorer, risers, fallers } = highlightsFor(data, "americas", 5);

    expect(topScorer?.nickname).toBe("A");
    expect(risers.map((row) => row.nickname)).toEqual(["C", "A"]);
    expect(fallers).toEqual([]);
  });

  it("respeita o limite de cada lista, do maior para o menor", () => {
    expect(
      highlightsFor(data, null, 1).risers.map((row) => row.nickname),
    ).toEqual(["C"]);
  });

  it("ninguém aparece nas duas listas: delta zero não é variação", () => {
    const flat = highlights({
      movers: [
        {
          playerId: "a",
          nickname: "A",
          team: "NRG",
          role: "Duelista",
          priceDeltaCents: 0,
          region: "americas",
        },
      ],
    });

    expect(highlightsFor(flat, null, 5).risers).toEqual([]);
    expect(highlightsFor(flat, null, 5).fallers).toEqual([]);
  });

  it("região sem ninguém devolve tudo vazio, sem quebrar", () => {
    const { topScorer, risers } = highlightsFor(data, "china", 5);

    expect(topScorer).toBeNull();
    expect(risers).toEqual([]);
  });
});

describe("pendingRegions", () => {
  const now = new Date("2026-09-04T22:00:00Z");

  it("região que já terminou os jogos de hoje não fica pendente", () => {
    const pending = pendingRegions(
      [
        match({
          id: "a",
          event: "VCT 2026: Americas Stage 2",
          scheduledAt: new Date("2026-09-04T17:00:00Z"),
          status: "finished",
        }),
      ],
      now,
    );

    expect(pending).toEqual([]);
  });

  it("região com jogo de hoje ainda por começar fica pendente", () => {
    const pending = pendingRegions(
      [
        match({
          id: "a",
          event: "VCT 2026: Americas Stage 2",
          scheduledAt: new Date("2026-09-04T17:00:00Z"),
          status: "finished",
        }),
        match({
          id: "b",
          event: "VCT 2026: Americas Stage 2",
          scheduledAt: new Date("2026-09-04T23:00:00Z"),
          status: "upcoming",
        }),
      ],
      now,
    );

    expect(pending).toEqual(["americas"]);
  });

  it("jogo ao vivo também segura a região", () => {
    const pending = pendingRegions(
      [
        match({
          id: "a",
          event: "VCT 2026: EMEA Stage 2",
          scheduledAt: new Date("2026-09-04T20:00:00Z"),
          status: "live",
        }),
      ],
      now,
    );

    expect(pending).toEqual(["emea"]);
  });

  it("uma região não segura a outra", () => {
    const pending = pendingRegions(
      [
        match({
          id: "a",
          event: "VCT 2026: Pacific Stage 1",
          scheduledAt: new Date("2026-09-04T06:00:00Z"),
          status: "finished",
        }),
        match({
          id: "b",
          event: "VCT 2026: Americas Stage 2",
          scheduledAt: new Date("2026-09-04T23:00:00Z"),
          status: "upcoming",
        }),
      ],
      now,
    );

    expect(pending).toEqual(["americas"]);
  });

  it("o dia é o de Brasília: jogo das 22h ainda é hoje", () => {
    // 05/09 01:00Z = 04/09 22:00 em Brasília. Contado em UTC, este jogo seria
    // "amanhã", a região sairia como liberada e a Home entregaria o resultado
    // parcial da rodada com partida ainda por acontecer.
    const pending = pendingRegions(
      [
        match({
          id: "a",
          event: "VCT 2026: Americas Stage 2",
          scheduledAt: new Date("2026-09-05T01:00:00Z"),
          status: "upcoming",
        }),
      ],
      now,
    );

    expect(pending).toEqual(["americas"]);
  });

  it("jogo de amanhã não segura o dia de hoje", () => {
    const pending = pendingRegions(
      [
        match({
          id: "a",
          event: "VCT 2026: Americas Stage 2",
          scheduledAt: new Date("2026-09-05T17:00:00Z"),
          status: "upcoming",
        }),
      ],
      now,
    );

    expect(pending).toEqual([]);
  });

  it("calendário vazio não segura ninguém — é o que destrava a liga de férias", () => {
    // O ponto da inversão: uma liga em intervalo entre stages não aparece na
    // janela de trava, e mesmo assim precisa mostrar os destaques dela.
    expect(pendingRegions([], now)).toEqual([]);
  });
});

function summary(overrides: Partial<HomeSummary> = {}): HomeSummary {
  return {
    pendingInvites: [],
    hasFinishedRound: false,
    recap: null,
    performances: [],
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
      highlights: highlights({ partial: true }),
    });

    expect(refreshIntervalMs(scoring)).toBe(LIVE_REFRESH_MS);
  });

  it("rodada fechada não precisa de pressa", () => {
    const closed = summary({
      highlights: highlights({ partial: false }),
    });

    expect(refreshIntervalMs(closed)).toBe(IDLE_REFRESH_MS);
  });
});
