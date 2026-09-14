import { describe, expect, it } from "vitest";

import { DEFAULT_CREST } from "@/lib/crest/crest";
import {
  rankStandings,
  splitPodium,
  standingZone,
} from "@/lib/championship/standings";
import type { StandingRow } from "@/lib/championship/types";

function row(
  overrides: Partial<StandingRow> & { userId: string },
): StandingRow {
  return {
    userName: overrides.userId,
    username: overrides.userId,
    teamName: `${overrides.userId} FC`,
    crest: DEFAULT_CREST,
    points: 0,
    ...overrides,
  };
}

describe("rankStandings", () => {
  it("ordena por pontuação decrescente", () => {
    const rows = [
      row({ userId: "a", points: 10 }),
      row({ userId: "b", points: 30 }),
      row({ userId: "c", points: 20 }),
    ];

    const result = rankStandings(rows, "a");

    expect(result.map((r) => r.userId)).toEqual(["b", "c", "a"]);
    expect(result.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it("empatados dividem a mesma posição (competition ranking)", () => {
    const rows = [
      row({ userId: "a", userName: "Ana", points: 20 }),
      row({ userId: "b", userName: "Bruno", points: 20 }),
      row({ userId: "c", userName: "Carla", points: 30 }),
      row({ userId: "d", userName: "Diego", points: 10 }),
    ];

    const result = rankStandings(rows, "a");

    expect(result.map((r) => r.userId)).toEqual(["c", "a", "b", "d"]);
    expect(result.map((r) => r.position)).toEqual([1, 2, 2, 4]);
  });

  it("desempata por nome (pt-BR) quando a pontuação é igual", () => {
    const rows = [
      row({ userId: "z", userName: "Zeca", points: 15 }),
      row({ userId: "a", userName: "Ávila", points: 15 }),
    ];

    const result = rankStandings(rows, "z");

    expect(result.map((r) => r.userId)).toEqual(["a", "z"]);
  });

  it("membro sem time ou com elenco vazio aparece com 0 pontos, não some", () => {
    const rows = [
      row({ userId: "a", points: 0 }),
      row({ userId: "b", points: 15 }),
    ];

    const result = rankStandings(rows, "a");

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.userId === "a")?.points).toBe(0);
  });

  it("marca isCurrentUser em exatamente uma linha", () => {
    const rows = [
      row({ userId: "a" }),
      row({ userId: "b" }),
      row({ userId: "c" }),
    ];

    const result = rankStandings(rows, "b");

    expect(result.filter((r) => r.isCurrentUser)).toHaveLength(1);
    expect(result.find((r) => r.isCurrentUser)?.userId).toBe("b");
  });
});

describe("standingZone", () => {
  it("com 5 membros, marca o 1º como líder e 2º/3º como pódio", () => {
    expect(standingZone(1, 5)).toBe("leader");
    expect(standingZone(2, 5)).toBe("podium");
    expect(standingZone(3, 5)).toBe("podium");
    expect(standingZone(4, 5)).toBeNull();
    expect(standingZone(5, 5)).toBeNull();
  });

  it("com 3 membros ou menos, nenhuma posição ganha faixa", () => {
    expect(standingZone(1, 3)).toBeNull();
    expect(standingZone(2, 3)).toBeNull();
    expect(standingZone(3, 3)).toBeNull();
  });

  it("empate em 2º lugar: as duas linhas de posição 2 ficam no pódio", () => {
    // 4 membros, posições (1, 2, 2, 4) — a de posição 4 fica de fora.
    expect(standingZone(1, 4)).toBe("leader");
    expect(standingZone(2, 4)).toBe("podium");
    expect(standingZone(4, 4)).toBeNull();
  });
});

describe("splitPodium", () => {
  const ranked = (points: number[]) =>
    rankStandings(
      points.map((p, i) => row({ userId: `u${i + 1}`, points: p })),
      "u1",
    );
  const ids = (rows: { userId: string }[]) => rows.map((r) => r.userId);

  it("sem empate: 1º, 2º e 3º no pódio, o resto na lista", () => {
    const { podium, rest } = splitPodium(ranked([90, 80, 70, 60, 50]));

    expect(podium.map((e) => [e.place, e.standing.userId, e.tiedCount])).toEqual([
      [1, "u1", 0],
      [2, "u2", 0],
      [3, "u3", 0],
    ]);
    expect(ids(rest)).toEqual(["u4", "u5"]);
  });

  it("empate largo em 2º: um time por posição, os empatados seguem na lista", () => {
    const { podium, rest } = splitPodium(ranked([90, 50, 50, 50, 50]));

    expect(podium.map((e) => [e.place, e.standing.userId, e.tiedCount])).toEqual([
      [1, "u1", 0],
      [2, "u2", 3],
    ]);
    expect(ids(rest)).toEqual(["u3", "u4", "u5"]);
    expect(rest.every((r) => r.position === 2)).toBe(true);
  });

  it("todo mundo empatado: sem pódio, a lista mostra todos", () => {
    const { podium, rest } = splitPodium(ranked([0, 0, 0, 0]));

    expect(podium).toEqual([]);
    expect(rest).toHaveLength(4);
  });

  it("um membro só ainda ganha o pódio", () => {
    const { podium, rest } = splitPodium(ranked([0]));

    expect(podium).toHaveLength(1);
    expect(rest).toEqual([]);
  });

  it("empate em 1º com mais gente abaixo: 1º e 3º no pódio (2º não existe)", () => {
    const { podium, rest } = splitPodium(ranked([80, 80, 40, 10]));

    expect(podium.map((e) => [e.place, e.tiedCount])).toEqual([
      [1, 1],
      [3, 0],
    ]);
    expect(ids(rest)).toEqual(["u2", "u4"]);
  });
});
