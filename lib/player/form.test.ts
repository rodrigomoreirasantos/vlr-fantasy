// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildFormSeries,
  groupPerformancesByMatch,
  lastMatchesPerPlayer,
  metricLabel,
  metricValue,
  summarizeRosterRound,
} from "@/lib/player/form";
import type { PlayerMatchPerformance } from "@/lib/player/types";

function performance(
  overrides: Partial<PlayerMatchPerformance> = {},
): PlayerMatchPerformance {
  return {
    playerId: "p1",
    nickname: "aspas",
    team: "LEVIATÁN",
    matchId: "m1",
    event: "VCT 2026: Americas Stage 2",
    scheduledAt: new Date("2026-09-01T20:00:00Z"),
    teamA: "LEVIATÁN",
    teamB: "LOUD",
    scoreA: 2,
    scoreB: 1,
    status: "finished",
    points: 24.5,
    kills: 40,
    deaths: 20,
    assists: 8,
    acs: 245.4,
    rating: 1.234,
    mapsWon: 2,
    mapsPlayed: 3,
    photoUrl: null,
    ...overrides,
  };
}

describe("metricValue", () => {
  it("arredonda cada métrica na precisão em que ela é lida", () => {
    const row = performance();

    expect(metricValue(row, "points")).toBe(24.5);
    expect(metricValue(row, "acs")).toBe(245);
    expect(metricValue(row, "rating")).toBe(1.23);
    expect(metricValue(row, "kills")).toBe(40);
    expect(metricValue(row, "kd")).toBe(2);
  });

  it("stat ausente no scoreboard vira null, nunca NaN", () => {
    const row = performance({ acs: null, rating: null });

    expect(metricValue(row, "acs")).toBeNull();
    expect(metricValue(row, "rating")).toBeNull();
    expect(Number.isNaN(metricValue(row, "acs"))).toBe(false);
  });

  it("K/D sem mortes é o próprio número de abates, não infinito", () => {
    expect(metricValue(performance({ kills: 17, deaths: 0 }), "kd")).toBe(17);
  });

  it("série sem scoreboard não vira K/D 0.00", () => {
    // `sum(kills)` devolve null quando nenhum mapa trouxe o número. Zerar aqui
    // faria "sem dado" parecer "jogou e não matou ninguém".
    const semDados = performance({ kills: null, deaths: null, assists: null });

    expect(metricValue(semDados, "kd")).toBeNull();
    expect(metricValue(semDados, "kills")).toBeNull();
  });

  it("rotula as métricas em pt-BR", () => {
    expect(metricLabel("points")).toBe("Pontos");
    expect(metricLabel("kills")).toBe("Abates");
  });
});

describe("lastMatchesPerPlayer", () => {
  it("corta por jogador, não na lista inteira", () => {
    const rows = [
      performance({
        playerId: "p1",
        matchId: "a",
        scheduledAt: new Date("2026-09-01T00:00:00Z"),
      }),
      performance({
        playerId: "p1",
        matchId: "b",
        scheduledAt: new Date("2026-09-02T00:00:00Z"),
      }),
      performance({
        playerId: "p1",
        matchId: "c",
        scheduledAt: new Date("2026-09-03T00:00:00Z"),
      }),
      performance({
        playerId: "p2",
        nickname: "TenZ",
        matchId: "d",
        scheduledAt: new Date("2026-08-30T00:00:00Z"),
      }),
    ];

    const byPlayer = lastMatchesPerPlayer(rows, 2);

    expect(byPlayer.get("p1")!.map((row) => row.matchId)).toEqual(["b", "c"]);
    expect(byPlayer.get("p2")!.map((row) => row.matchId)).toEqual(["d"]);
  });

  it("devolve as partidas em ordem cronológica", () => {
    const rows = [
      performance({
        matchId: "novo",
        scheduledAt: new Date("2026-09-03T00:00:00Z"),
      }),
      performance({
        matchId: "velho",
        scheduledAt: new Date("2026-09-01T00:00:00Z"),
      }),
    ];

    expect(
      lastMatchesPerPlayer(rows, 5)
        .get("p1")!
        .map((r) => r.matchId),
    ).toEqual(["velho", "novo"]);
  });

  it("lista vazia devolve mapa vazio", () => {
    expect(lastMatchesPerPlayer([], 5).size).toBe(0);
  });
});

describe("buildFormSeries", () => {
  const rows = [
    performance({
      playerId: "p1",
      nickname: "aspas",
      matchId: "a",
      points: 10,
      scheduledAt: new Date("2026-09-01T00:00:00Z"),
    }),
    performance({
      playerId: "p1",
      nickname: "aspas",
      matchId: "b",
      points: 20,
      scheduledAt: new Date("2026-09-02T00:00:00Z"),
    }),
    performance({
      playerId: "p1",
      nickname: "aspas",
      matchId: "c",
      points: 30,
      scheduledAt: new Date("2026-09-03T00:00:00Z"),
    }),
    performance({
      playerId: "p2",
      nickname: "TenZ",
      team: "SENTINELS",
      teamA: "SENTINELS",
      teamB: "NRG",
      matchId: "d",
      points: 5,
      scheduledAt: new Date("2026-09-02T12:00:00Z"),
    }),
  ];

  it("rotula o eixo por recência, com o jogo mais recente à direita", () => {
    const { points } = buildFormSeries(rows, "points", 5);

    expect(points.map((point) => point.label)).toEqual([
      "J-2",
      "J-1",
      "Último",
    ]);
  });

  it("alinha à direita: quem jogou menos deixa buraco no começo", () => {
    const { points } = buildFormSeries(rows, "points", 5);

    expect(points.map((point) => point.values.p1)).toEqual([10, 20, 30]);
    expect(points.map((point) => point.values.p2)).toEqual([null, null, 5]);
  });

  it("nomeia as séries pelos jogadores, em ordem alfabética", () => {
    const { series } = buildFormSeries(rows, "points", 5);

    // `localeCompare("pt-BR")` ignora caixa: "aspas" vem antes de "TenZ".
    expect(series).toEqual([
      { playerId: "p1", nickname: "aspas", photoUrl: null },
      { playerId: "p2", nickname: "TenZ", photoUrl: null },
    ]);
  });

  it("cada ponto sabe qual foi a partida — é o que o tooltip mostra", () => {
    const { points } = buildFormSeries(rows, "points", 5);
    const last = points[points.length - 1]!;

    expect(last.matches.p1!.opponent).toBe("LOUD");
    expect(last.matches.p2!.opponent).toBe("NRG");
  });

  it("respeita a janela pedida", () => {
    expect(buildFormSeries(rows, "points", 2).points).toHaveLength(2);
  });

  it("segue a métrica escolhida", () => {
    const { points } = buildFormSeries(rows, "kills", 5);

    expect(points.map((point) => point.values.p1)).toEqual([40, 40, 40]);
  });

  it("sem lado resolvido, o tooltip mostra o confronto inteiro", () => {
    const { points } = buildFormSeries(
      [performance({ team: "SENTINELS", teamA: "LEVIATÁN", teamB: "LOUD" })],
      "points",
      5,
    );

    expect(points[0]!.matches.p1!.opponent).toBe("LEVIATÁN x LOUD");
  });

  it("sem partida, não há gráfico", () => {
    expect(buildFormSeries([], "points", 5)).toEqual({
      points: [],
      series: [],
    });
  });
});

describe("groupPerformancesByMatch", () => {
  it("dois dos seus na mesma partida dão um placar só, com os dois lados", () => {
    const recaps = groupPerformancesByMatch([
      performance({
        playerId: "p1",
        nickname: "aspas",
        team: "LEVIATÁN",
        matchId: "m1",
        points: 24.5,
      }),
      performance({
        playerId: "p2",
        nickname: "Sacy",
        team: "LOUD",
        matchId: "m1",
        points: 18,
      }),
    ]);

    expect(recaps).toHaveLength(1);
    expect(recaps[0]!.scoreA).toBe(2);
    expect(recaps[0]!.scoreB).toBe(1);
    expect(recaps[0]!.players.map((p) => [p.nickname, p.side])).toEqual([
      ["aspas", "A"],
      ["Sacy", "B"],
    ]);
  });

  it("partidas diferentes continuam sendo entradas diferentes", () => {
    const recaps = groupPerformancesByMatch([
      performance({ matchId: "m1" }),
      performance({ playerId: "p2", nickname: "TenZ", matchId: "m2" }),
    ]);

    expect(recaps).toHaveLength(2);
  });

  it("resolve vitória e derrota pelo lado do jogador", () => {
    const [recap] = groupPerformancesByMatch([
      performance({ playerId: "p1", team: "LEVIATÁN", matchId: "m1" }),
      performance({
        playerId: "p2",
        nickname: "Sacy",
        team: "LOUD",
        matchId: "m1",
      }),
    ]);

    expect(recap!.players.find((p) => p.nickname === "aspas")!.won).toBe(true);
    expect(recap!.players.find((p) => p.nickname === "Sacy")!.won).toBe(false);
  });

  it("sem placar, vitória é null — ausência de dado, não derrota", () => {
    const [recap] = groupPerformancesByMatch([
      performance({ scoreA: null, scoreB: null, status: "live" }),
    ]);

    expect(recap!.players[0]!.won).toBeNull();
  });

  it("ordena da partida mais recente para a mais antiga", () => {
    const recaps = groupPerformancesByMatch([
      performance({
        matchId: "velho",
        scheduledAt: new Date("2026-09-01T00:00:00Z"),
      }),
      performance({
        matchId: "novo",
        scheduledAt: new Date("2026-09-05T00:00:00Z"),
      }),
    ]);

    expect(recaps.map((recap) => recap.matchId)).toEqual(["novo", "velho"]);
  });

  it("jogador que trocou de time não ganha um lado chutado", () => {
    // `player.team` é o time ATUAL; a partida guarda o de então.
    const [recap] = groupPerformancesByMatch([
      performance({ team: "SENTINELS", teamA: "LEVIATÁN", teamB: "LOUD" }),
    ]);

    expect(recap!.players[0]!.side).toBeNull();
    // E sem lado não se afirma vitória: apontar "A" daria vencedor a quem perdeu.
    expect(recap!.players[0]!.won).toBeNull();
  });

  it("sem partida, sem entrada", () => {
    expect(groupPerformancesByMatch([])).toEqual([]);
  });
});

describe("summarizeRosterRound", () => {
  it("conta quem jogou, o saldo e o melhor", () => {
    const recaps = groupPerformancesByMatch([
      performance({
        playerId: "p1",
        nickname: "aspas",
        team: "LEVIATÁN",
        matchId: "m1",
        points: 24.5,
      }),
      performance({
        playerId: "p2",
        nickname: "Sacy",
        team: "LOUD",
        matchId: "m1",
        points: 18,
      }),
    ]);

    expect(summarizeRosterRound(recaps, 5)).toBe(
      "2 dos seus 5 jogaram: 1 vitória e 1 derrota, 42.5 pontos somados. Melhor: aspas (24.5).",
    );
  });

  it("um jogador só conjuga no singular", () => {
    const recaps = groupPerformancesByMatch([performance({ points: 12 })]);

    expect(summarizeRosterRound(recaps, 5)).toBe(
      "1 dos seus 5 jogou: 1 vitória, 12.0 pontos somados. Melhor: aspas (12.0).",
    );
  });

  it("partida sem placar não inventa vitória nem derrota", () => {
    const recaps = groupPerformancesByMatch([
      performance({ scoreA: null, scoreB: null, status: "live", points: 9 }),
    ]);

    expect(summarizeRosterRound(recaps, 5)).toBe(
      "1 dos seus 5 jogou: 9.0 pontos somados. Melhor: aspas (9.0).",
    );
  });

  it("companheiros de time vencendo juntos contam uma vitória, não três", () => {
    const recaps = groupPerformancesByMatch([
      performance({
        playerId: "p1",
        nickname: "stax",
        team: "T1",
        teamA: "T1",
        teamB: "VARREL",
        matchId: "m1",
        points: 20,
      }),
      performance({
        playerId: "p2",
        nickname: "iZu",
        team: "T1",
        teamA: "T1",
        teamB: "VARREL",
        matchId: "m1",
        points: 18,
      }),
      performance({
        playerId: "p3",
        nickname: "BuZz",
        team: "T1",
        teamA: "T1",
        teamB: "VARREL",
        matchId: "m1",
        points: 16,
      }),
    ]);

    expect(summarizeRosterRound(recaps, 5)).toBe(
      "3 dos seus 5 jogaram: 1 vitória, 54.0 pontos somados. Melhor: stax (20.0).",
    );
  });

  it("jogador sem lado resolvido não entra na conta de vitórias", () => {
    const recaps = groupPerformancesByMatch([
      performance({
        team: "SENTINELS",
        teamA: "LEVIATÁN",
        teamB: "LOUD",
        points: 10,
      }),
    ]);

    expect(summarizeRosterRound(recaps, 5)).toBe(
      "1 dos seus 5 jogou: 10.0 pontos somados. Melhor: aspas (10.0).",
    );
  });

  it("sem partida, não há frase", () => {
    expect(summarizeRosterRound([], 5)).toBeNull();
  });
});
