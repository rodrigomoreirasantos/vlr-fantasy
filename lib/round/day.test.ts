// @vitest-environment node
import { describe, expect, it } from "vitest";

import { APP_TZ, dayKey, isSameDay } from "@/lib/round/day";

describe("dayKey", () => {
  it("conta o dia no fuso do jogo, não no do servidor", () => {
    // 01:00Z de 05/09 ainda é a noite de 04/09 em Brasília — e é nesse dia que
    // o jogo de Americas aconteceu.
    expect(dayKey(new Date("2026-09-05T01:00:00Z"))).toBe("2026-09-04");
  });

  it("meio-dia em UTC e em Brasília é o mesmo dia", () => {
    expect(dayKey(new Date("2026-09-04T17:00:00Z"))).toBe("2026-09-04");
  });

  it("o fuso é injetável", () => {
    expect(dayKey(new Date("2026-09-05T01:00:00Z"), "UTC")).toBe("2026-09-05");
  });
});

describe("isSameDay", () => {
  it("um jogo das 22h de Brasília é do mesmo dia de um das 14h", () => {
    // Em UTC seriam dias diferentes — e era isso que liberava o portão dos
    // destaques com partida ainda por jogar.
    expect(
      isSameDay(
        new Date("2026-09-04T17:00:00Z"),
        new Date("2026-09-05T01:00:00Z"),
      ),
    ).toBe(true);
  });

  it("dias de verdade diferentes continuam diferentes", () => {
    expect(
      isSameDay(
        new Date("2026-09-04T17:00:00Z"),
        new Date("2026-09-05T17:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("APP_TZ", () => {
  it("é constante — servidor e cliente têm que chegar ao mesmo dia", () => {
    expect(APP_TZ).toBe("America/Sao_Paulo");
  });
});
