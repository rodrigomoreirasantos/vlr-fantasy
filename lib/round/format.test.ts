import { describe, expect, it } from "vitest";

import {
  availabilityLabel,
  availabilityMessage,
  formatKickoffTime,
  formatMatchDay,
  formatMatchKickoff,
} from "@/lib/round/format";

describe("formatMatchKickoff", () => {
  it("formata em português, com dia da semana abreviado", () => {
    // 2026-03-12 é uma quinta.
    const scheduledAt = new Date("2026-03-12T21:00:00Z");
    expect(formatMatchKickoff(scheduledAt)).toBe("qui, 12/03 às 21:00");
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
  it("mostra só a hora", () => {
    expect(formatKickoffTime(new Date("2026-09-03T21:00:00Z"))).toBe("21:00");
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
});
