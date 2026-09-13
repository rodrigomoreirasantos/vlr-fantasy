import { describe, expect, it } from "vitest";

import { isTeamLocked, lockedOrganizations } from "@/lib/market/lock";
import type { RoundMatch } from "@/lib/round/types";

/** Hoje, 03/09, meio-dia — todos os horários abaixo são deste dia. */
const NOW = new Date("2026-09-03T12:00:00Z");

function match(
  id: string,
  event: string,
  teamA: string,
  teamB: string,
  scheduledAt: Date,
): RoundMatch {
  return {
    id,
    teamA,
    teamB,
    event,
    scheduledAt,
    status: "upcoming",
    scoreA: null,
    scoreB: null,
  };
}

describe("lockedOrganizations", () => {
  it("antes do fechamento, ninguém está travado", () => {
    const grade = [
      match(
        "a",
        "VCT Americas",
        "SENTINELS",
        "NRG",
        new Date("2026-09-03T20:00:00Z"),
      ),
    ];

    expect(lockedOrganizations(grade, NOW)).toEqual([]);
  });

  it("uma hora antes do primeiro jogo do dia, o campeonato tranca", () => {
    const grade = [
      match(
        "a",
        "VCT Americas",
        "SENTINELS",
        "NRG",
        new Date("2026-09-03T12:30:00Z"),
      ),
    ];

    expect(lockedOrganizations(grade, NOW).sort()).toEqual([
      "NRG",
      "SENTINELS",
    ]);
  });

  it("trava o campeonato inteiro, não só quem joga hoje", () => {
    const grade = [
      match(
        "a",
        "VCT Americas",
        "SENTINELS",
        "NRG",
        new Date("2026-09-03T12:30:00Z"),
      ),
      // LOUD e MIBR jogam depois de amanhã — e mesmo assim ficam travados: é
      // o campeonato que fecha, senão bastaria ver o primeiro mapa do dia
      // para reescalar quem entra às 22h.
      match(
        "b",
        "VCT Americas",
        "LOUD",
        "MIBR",
        new Date("2026-09-05T20:00:00Z"),
      ),
    ];

    expect(lockedOrganizations(grade, NOW).sort()).toEqual([
      "LOUD",
      "MIBR",
      "NRG",
      "SENTINELS",
    ]);
  });

  it("um campeonato fechado não tranca o outro", () => {
    const grade = [
      match(
        "a",
        "VCT Pacific",
        "DRX",
        "Gen.G",
        new Date("2026-09-03T08:00:00Z"),
      ),
      match(
        "b",
        "VCT Americas",
        "SENTINELS",
        "NRG",
        new Date("2026-09-03T20:00:00Z"),
      ),
    ];

    expect(lockedOrganizations(grade, NOW).sort()).toEqual(["DRX", "Gen.G"]);
  });

  it("a partida já encerrada de hoje continua trancando o dia", () => {
    const grade = [
      {
        ...match(
          "a",
          "VCT Americas",
          "SENTINELS",
          "NRG",
          new Date("2026-09-03T09:00:00Z"),
        ),
        status: "finished" as const,
      },
      // O segundo jogo do dia é às 20h; sem a regra do dia, o mercado
      // reabriria agora e fecharia de novo às 19h.
      match(
        "b",
        "VCT Americas",
        "LOUD",
        "MIBR",
        new Date("2026-09-03T20:00:00Z"),
      ),
    ];

    expect(lockedOrganizations(grade, NOW)).toContain("LOUD");
  });

  it("o jogo de amanhã não tranca hoje", () => {
    const grade = [
      match(
        "a",
        "VCT Americas",
        "SENTINELS",
        "NRG",
        new Date("2026-09-04T12:30:00Z"),
      ),
    ];

    expect(lockedOrganizations(grade, NOW)).toEqual([]);
  });

  it("grade vazia não tranca nada", () => {
    expect(lockedOrganizations([], NOW)).toEqual([]);
  });

  it("a trava não reabre quando o dia UTC vira mas o dia de jogo continua", () => {
    // Jogo 04/09 20:00 em Brasília (23:00Z); o mercado fechou às 22:00Z (19:00
    // em Brasília, uma hora antes). `now` já é 05/09 em UTC, mas ainda 04/09
    // em Brasília — o dia de jogo continua, e a trava tem de continuar também.
    const grade = [
      match(
        "a",
        "VCT Americas",
        "SENTINELS",
        "NRG",
        new Date("2026-09-04T23:00:00Z"),
      ),
    ];
    const now = new Date("2026-09-05T01:00:00Z");

    expect(lockedOrganizations(grade, now).sort()).toEqual(["NRG", "SENTINELS"]);
  });

  it("a trava não vaza para o dia seguinte de verdade", () => {
    // Caso simétrico: o jogo é 04/09 22:00 em Brasília (mesma partida do
    // teste anterior), mas agora `now` já é 05/09 01:00 em Brasília — um dia
    // de jogo genuinamente novo, não só a mesma noite vista sob outro fuso.
    // Sob UTC cru (o bug antigo), as duas datas caem no mesmo dia-calendário
    // (05/09), e a trava ficaria presa aberta indevidamente; com o fuso da
    // regra, `isSameDay` já reconhece que o dia de jogo virou.
    const grade = [
      match(
        "a",
        "VCT Americas",
        "SENTINELS",
        "NRG",
        new Date("2026-09-05T01:00:00Z"),
      ),
    ];
    const now = new Date("2026-09-05T04:00:00Z");

    expect(lockedOrganizations(grade, now)).toEqual([]);
  });
});

describe("isTeamLocked", () => {
  it("responde pela organização do jogador", () => {
    expect(isTeamLocked(["FNATIC"], "FNATIC")).toBe(true);
    expect(isTeamLocked(["FNATIC"], "SENTINELS")).toBe(false);
  });
});
