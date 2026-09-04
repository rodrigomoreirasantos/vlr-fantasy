import { describe, expect, it } from "vitest";

import {
  MARKET_CLOSE_LEAD_MS,
  formatClosesAt,
  formatMarketClose,
  formatTimeLeft,
  isMarketOpen,
  marketClosesByMatch,
  nextMarketClose,
} from "@/lib/market/window";
import type { RoundMatch } from "@/lib/round/types";

const opensAt = new Date("2026-03-10T00:00:00Z");
const closesAt = new Date("2026-03-14T18:00:00Z");

describe("isMarketOpen", () => {
  it("está aberto estritamente entre a abertura e o fechamento", () => {
    const now = new Date("2026-03-12T12:00:00Z");
    expect(isMarketOpen({ opensAt, closesAt }, now)).toBe(true);
  });

  it("considera aberto no instante exato da abertura", () => {
    expect(isMarketOpen({ opensAt, closesAt }, opensAt)).toBe(true);
  });

  it("considera fechado no instante exato do fechamento", () => {
    expect(isMarketOpen({ opensAt, closesAt }, closesAt)).toBe(false);
  });

  it("está fechado antes da abertura", () => {
    const now = new Date("2026-03-09T23:59:59Z");
    expect(isMarketOpen({ opensAt, closesAt }, now)).toBe(false);
  });

  it("está fechado depois do fechamento", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    expect(isMarketOpen({ opensAt, closesAt }, now)).toBe(false);
  });
});

describe("formatTimeLeft", () => {
  it("mostra horas e minutos quando falta mais de uma hora", () => {
    const now = new Date("2026-03-13T05:48:00Z"); // 36h12m antes do fechamento
    expect(formatTimeLeft(closesAt, now)).toBe("36h 12m");
  });

  it("mostra só minutos quando falta menos de uma hora", () => {
    const now = new Date("2026-03-14T17:48:00Z");
    expect(formatTimeLeft(closesAt, now)).toBe("12m");
  });

  it("mostra 'Encerrado' quando o fechamento já passou", () => {
    const now = new Date("2026-03-14T18:00:01Z");
    expect(formatTimeLeft(closesAt, now)).toBe("Encerrado");
  });

  it("mostra 'Encerrado' no instante exato do fechamento", () => {
    expect(formatTimeLeft(closesAt, closesAt)).toBe("Encerrado");
  });
});

describe("formatClosesAt", () => {
  it("formata em português, com dia da semana abreviado", () => {
    // 2026-03-14 é um sábado.
    expect(formatClosesAt(closesAt)).toBe("Fecha sáb, 14/03 às 18:00");
  });
});

describe("formatMarketClose", () => {
  it("com o fechamento à frente, diz quanto falta", () => {
    const now = new Date("2026-03-13T06:00:00Z");

    expect(formatMarketClose(closesAt, now)).toBe("Mercado fecha em 36h 0m");
  });

  it("passado o fechamento, o mercado está fechado — não 'fecha em Encerrado'", () => {
    const now = new Date("2026-03-14T19:00:00Z");

    expect(formatMarketClose(closesAt, now)).toBe("Mercado fechado");
  });

  it("no instante exato do fechamento, já está fechado", () => {
    expect(formatMarketClose(closesAt, closesAt)).toBe("Mercado fechado");
  });
});

describe("marketClosesByMatch", () => {
  /** 04/09 é o dia seguinte a 03/09 em qualquer fuso destes testes. */
  const AMERICAS_13H = new Date("2026-09-04T17:00:00Z");
  const AMERICAS_16H = new Date("2026-09-04T20:00:00Z");
  const AMERICAS_DIA_SEGUINTE = new Date("2026-09-05T17:00:00Z");
  const PACIFIC_MADRUGADA = new Date("2026-09-04T08:00:00Z");

  function match(id: string, event: string, scheduledAt: Date): RoundMatch {
    return {
      id,
      teamA: "NRG",
      teamB: "100 Thieves",
      event,
      scheduledAt,
      status: "upcoming",
      scoreA: null,
      scoreB: null,
    };
  }

  const grade = () => [
    match("a", "VCT 2026: Americas Stage 2", AMERICAS_16H),
    match("b", "VCT 2026: Americas Stage 2", AMERICAS_13H),
    match("c", "VCT 2026: Americas Stage 2", AMERICAS_DIA_SEGUINTE),
    match("d", "VCT 2026: Pacific Stage 2", PACIFIC_MADRUGADA),
  ];

  it("os jogos de um campeonato no mesmo dia fecham juntos, 1h antes do primeiro", () => {
    const closes = marketClosesByMatch(grade());
    const esperado = new Date(AMERICAS_13H.getTime() - MARKET_CLOSE_LEAD_MS);

    expect(closes.get("b")).toEqual(esperado);
    // O jogo das 16h não tem fechamento próprio: o mercado já fechou às 12h.
    expect(closes.get("a")).toEqual(esperado);
  });

  it("cada dia tem o seu fechamento", () => {
    const closes = marketClosesByMatch(grade());

    expect(closes.get("c")).toEqual(
      new Date(AMERICAS_DIA_SEGUINTE.getTime() - MARKET_CLOSE_LEAD_MS),
    );
    expect(closes.get("c")).not.toEqual(closes.get("b"));
  });

  it("um campeonato não fecha o mercado do outro", () => {
    const closes = marketClosesByMatch(grade());

    expect(closes.get("d")).toEqual(
      new Date(PACIFIC_MADRUGADA.getTime() - MARKET_CLOSE_LEAD_MS),
    );
    expect(closes.get("d")).not.toEqual(closes.get("b"));
  });
});

describe("nextMarketClose", () => {
  const KICKOFF = new Date("2026-09-04T17:00:00Z");

  function match(id: string, scheduledAt: Date): RoundMatch {
    return {
      id,
      teamA: "NRG",
      teamB: "100 Thieves",
      event: "VCT 2026: Americas Stage 2",
      scheduledAt,
      status: "upcoming",
      scoreA: null,
      scoreB: null,
    };
  }

  it("é o primeiro fechamento que ainda não passou", () => {
    const closesAt = nextMarketClose(
      [match("a", KICKOFF)],
      new Date("2026-09-03T21:00:00Z"),
    );

    expect(closesAt).toEqual(new Date("2026-09-04T16:00:00Z"));
  });

  it("passado o fechamento do dia, vale o do dia seguinte", () => {
    const closesAt = nextMarketClose(
      [match("a", KICKOFF), match("b", new Date("2026-09-05T17:00:00Z"))],
      new Date("2026-09-04T16:30:00Z"),
    );

    expect(closesAt).toEqual(new Date("2026-09-05T16:00:00Z"));
  });

  it("sem jogo marcado, não há fechamento a anunciar", () => {
    expect(nextMarketClose([], new Date())).toBeNull();
  });
});
