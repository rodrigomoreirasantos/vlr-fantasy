import { describe, expect, it } from "vitest";

import {
  availabilityLabel,
  availabilityMessage,
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
