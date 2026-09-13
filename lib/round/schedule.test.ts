// @vitest-environment node
import { describe, expect, it } from "vitest";

import { groupMatchesByDay, nextMatchId } from "@/lib/round/schedule";
import type { RoundMatch } from "@/lib/round/types";

const NOW = new Date("2026-09-03T12:00:00Z");

function match(overrides: Partial<RoundMatch> = {}): RoundMatch {
  return {
    id: "match-1",
    teamA: "SENTINELS",
    teamB: "FNATIC",
    event: "VCT Americas",
    scheduledAt: new Date("2026-09-03T21:00:00Z"),
    status: "upcoming",
    scoreA: null,
    scoreB: null,
    ...overrides,
  };
}

describe("groupMatchesByDay", () => {
  it("uma lista vazia não gera dia nenhum", () => {
    expect(groupMatchesByDay([], NOW)).toEqual([]);
  });

  it("agrupa as partidas do mesmo dia sob um único cabeçalho", () => {
    const days = groupMatchesByDay(
      [
        match({ id: "a", scheduledAt: new Date("2026-09-03T21:00:00Z") }),
        match({ id: "b", scheduledAt: new Date("2026-09-03T23:30:00Z") }),
      ],
      NOW,
    );

    expect(days).toHaveLength(1);
    expect(days[0].matches.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("ordena por horário mesmo se o banco devolver fora de ordem", () => {
    const days = groupMatchesByDay(
      [
        match({ id: "tarde", scheduledAt: new Date("2026-09-04T20:00:00Z") }),
        match({ id: "cedo", scheduledAt: new Date("2026-09-04T08:00:00Z") }),
      ],
      NOW,
    );

    expect(days[0].matches.map((row) => row.id)).toEqual(["cedo", "tarde"]);
  });

  it("os dias saem em ordem cronológica", () => {
    const days = groupMatchesByDay(
      [
        match({ id: "depois", scheduledAt: new Date("2026-09-08T21:00:00Z") }),
        match({ id: "hoje", scheduledAt: new Date("2026-09-03T21:00:00Z") }),
      ],
      NOW,
    );

    expect(days.map((day) => day.matches[0].id)).toEqual(["hoje", "depois"]);
  });

  it("o agrupamento é de exibição — o mesmo par de jogos vira 1 ou 2 dias conforme o fuso", () => {
    // Mesmo dia em São Paulo (04/09), mas a segunda partida já cai em 05/09
    // em Tóquio — o cabeçalho é informação de exibição, não de regra.
    const matches = [
      match({ id: "a", scheduledAt: new Date("2026-09-04T08:00:00Z") }),
      match({ id: "b", scheduledAt: new Date("2026-09-05T01:00:00Z") }),
    ];

    const emSaoPaulo = groupMatchesByDay(matches, NOW, "America/Sao_Paulo");
    expect(emSaoPaulo).toHaveLength(1);
    expect(emSaoPaulo[0].matches.map((row) => row.id)).toEqual(["a", "b"]);

    const emToquio = groupMatchesByDay(matches, NOW, "Asia/Tokyo");
    expect(emToquio).toHaveLength(2);
  });

  it("rotula hoje e amanhã pelo nome, não pela data", () => {
    const days = groupMatchesByDay(
      [
        match({ id: "hoje", scheduledAt: new Date("2026-09-03T21:00:00Z") }),
        match({ id: "amanha", scheduledAt: new Date("2026-09-04T08:00:00Z") }),
        match({ id: "depois", scheduledAt: new Date("2026-09-08T21:00:00Z") }),
      ],
      NOW,
    );

    expect(days.map((day) => day.label)).toEqual([
      "Hoje",
      "Amanhã",
      "ter, 08/09",
    ]);
  });
});

describe("nextMatchId", () => {
  it("é a partida que começa primeiro entre as que ainda não começaram", () => {
    const id = nextMatchId(
      [
        match({ id: "depois", scheduledAt: new Date("2026-09-04T08:00:00Z") }),
        match({ id: "logo", scheduledAt: new Date("2026-09-03T21:00:00Z") }),
      ],
      NOW,
    );

    expect(id).toBe("logo");
  });

  it("ignora partida que já começou", () => {
    const id = nextMatchId(
      [
        match({ id: "rolando", scheduledAt: new Date("2026-09-03T10:00:00Z") }),
        match({ id: "proxima", scheduledAt: new Date("2026-09-03T21:00:00Z") }),
      ],
      NOW,
    );

    expect(id).toBe("proxima");
  });

  it("devolve null quando todas já começaram", () => {
    expect(
      nextMatchId(
        [match({ scheduledAt: new Date("2026-09-03T10:00:00Z") })],
        NOW,
      ),
    ).toBeNull();
  });

  it("devolve null para uma lista vazia", () => {
    expect(nextMatchId([], NOW)).toBeNull();
  });
});
