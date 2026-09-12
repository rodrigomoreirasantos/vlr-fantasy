import { describe, expect, it } from "vitest";

import {
  availabilityLabel,
  availabilityMessage,
  formatKickoffTime,
  formatMatchDay,
  formatMatchKickoff,
} from "@/lib/round/format";

describe("formatMatchKickoff", () => {
  it("formata em português, com dia da semana abreviado, no fuso default (São Paulo)", () => {
    // 2026-03-12 é uma quinta. 21:00Z = 18:00 em America/Sao_Paulo (UTC-3).
    const scheduledAt = new Date("2026-03-12T21:00:00Z");
    expect(formatMatchKickoff(scheduledAt)).toBe("qui, 12/03 às 18:00");
  });

  it("aceita um fuso explícito — o mesmo instante, outra frase", () => {
    // 21:00Z de 12/03 já é 06:00 de 13/03 em Asia/Tokyo (UTC+9).
    const scheduledAt = new Date("2026-03-12T21:00:00Z");
    expect(formatMatchKickoff(scheduledAt, "Asia/Tokyo")).toBe(
      "sex, 13/03 às 06:00",
    );
  });
});

describe("availabilityLabel", () => {
  it("traduz cada estado para pt-BR", () => {
    expect(availabilityLabel("available")).toBe("Disponível");
    expect(availabilityLabel("bench")).toBe("Reserva");
    expect(availabilityLabel("injured")).toBe("Lesionado");
    expect(availabilityLabel("eliminated")).toBe("Time eliminado");
    expect(availabilityLabel("doubtful")).toBe("Dúvida");
  });
});

describe("availabilityMessage", () => {
  it("sem nota: cai só no rótulo", () => {
    expect(availabilityMessage("TenZ", "bench", null)).toBe(
      "TenZ não deve jogar (Reserva).",
    );
  });

  it("com nota: acrescenta o detalhe em pt-BR", () => {
    expect(
      availabilityMessage("TenZ", "injured", "Fora por lesão no pulso"),
    ).toBe("TenZ não deve jogar (Lesionado): Fora por lesão no pulso.");
  });
});

describe("formatKickoffTime", () => {
  it("mostra só a hora, no fuso default (America/Sao_Paulo, UTC-3)", () => {
    expect(formatKickoffTime(new Date("2026-09-03T21:00:00Z"))).toBe("18:00");
  });

  it("o mesmo instante, escrito no fuso de quem está lendo", () => {
    // 21:00Z de 03/09 é 18:00 em São Paulo e 06:00 do dia seguinte em Tóquio
    // — mesmo instante absoluto, duas frases.
    const scheduledAt = new Date("2026-09-03T21:00:00Z");
    expect(formatKickoffTime(scheduledAt, "Asia/Tokyo")).toBe("06:00");
  });
});

describe("formatMatchDay", () => {
  const now = new Date("2026-09-03T12:00:00Z");

  it("chama o dia de hoje de 'Hoje'", () => {
    expect(formatMatchDay(new Date("2026-09-03T23:30:00Z"), now)).toBe("Hoje");
  });

  it("chama o dia seguinte de 'Amanhã'", () => {
    expect(formatMatchDay(new Date("2026-09-04T08:00:00Z"), now)).toBe(
      "Amanhã",
    );
  });

  it("os demais dias saem por extenso, em pt-BR", () => {
    expect(formatMatchDay(new Date("2026-09-08T21:00:00Z"), now)).toBe(
      "ter, 08/09",
    );
  });

  it("um dia anterior não vira 'Hoje'", () => {
    expect(formatMatchDay(new Date("2026-09-02T21:00:00Z"), now)).toBe(
      "qua, 02/09",
    );
  });

  it("um jogo do ano seguinte traz o ano, para não ficar ambíguo", () => {
    expect(formatMatchDay(new Date("2027-01-10T21:00:00Z"), now)).toBe(
      "dom, 10/01/2027",
    );
  });

  it("'Hoje' depende de quem está lendo — o mesmo instante é 'Amanhã' em Tóquio", () => {
    // 21:00Z de 03/09 é "hoje" (18h) em São Paulo, mas já é 04/09 06:00 em
    // Tóquio — um dia à frente de `now` (03/09 21:00 em Tóquio).
    const scheduledAt = new Date("2026-09-03T21:00:00Z");
    expect(formatMatchDay(scheduledAt, now, "America/Sao_Paulo")).toBe("Hoje");
    expect(formatMatchDay(scheduledAt, now, "Asia/Tokyo")).toBe("Amanhã");
  });
});
