import { describe, expect, it } from "vitest";

import {
  formatClosesAt,
  formatTimeLeft,
  isMarketOpen,
} from "@/lib/market/window";

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
