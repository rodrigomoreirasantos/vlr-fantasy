// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  VLR_SOURCE_TZ,
  parseVlrDayTime,
  parseVlrTimestamp,
} from "@/lib/vlr/normalize/kickoff";

describe("parseVlrTimestamp", () => {
  it("lê `data-utc-ts` como horário de Nova York, não como UTC", () => {
    // A partida 724899 traz este `data-utc-ts` e imprime "5:00 PM EDT" ao
    // lado. EDT = UTC-4 → 21:00Z. Ler como UTC daria 17:00Z: 4h de erro.
    expect(parseVlrTimestamp("2026-09-02 17:00:00").toISOString()).toBe(
      "2026-09-02T21:00:00.000Z",
    );
  });

  it("respeita o horário padrão (EST, UTC-5) no inverno do hemisfério norte", () => {
    expect(parseVlrTimestamp("2026-01-14 17:00:00").toISOString()).toBe(
      "2026-01-14T22:00:00.000Z",
    );
  });

  it("aceita um fuso injetado — o default é apenas o do vlr.gg", () => {
    expect(parseVlrTimestamp("2026-09-02 17:00:00", "UTC").toISOString()).toBe(
      "2026-09-02T17:00:00.000Z",
    );
    expect(VLR_SOURCE_TZ).toBe("America/New_York");
  });

  it("lança em vez de devolver uma data inválida", () => {
    expect(() => parseVlrTimestamp("não é data")).toThrow(/inválido/);
  });
});

describe("parseVlrDayTime", () => {
  it("junta o cabeçalho de dia com a hora do card, em Nova York", () => {
    expect(
      parseVlrDayTime("Thu, September 3, 2026", "5:00 PM")?.toISOString(),
    ).toBe("2026-09-03T21:00:00.000Z");
  });

  it("aceita o cabeçalho sem o dia da semana", () => {
    expect(parseVlrDayTime("September 3, 2026", "7:00 AM")?.toISOString()).toBe(
      "2026-09-03T11:00:00.000Z",
    );
  });

  it("devolve null quando o horário ainda é TBD", () => {
    expect(parseVlrDayTime("Thu, September 3, 2026", "TBD")).toBeNull();
    expect(parseVlrDayTime("Thu, September 3, 2026", "")).toBeNull();
  });

  it("devolve null sem cabeçalho de dia", () => {
    expect(parseVlrDayTime("", "5:00 PM")).toBeNull();
  });
});

describe("parseVlrDayTime — independente de locale", () => {
  it("continua lendo meses em inglês com o dayjs em pt-BR", async () => {
    // `lib/market/window.ts` chama `dayjs.locale("pt-br")` globalmente ao ser
    // importado; qualquer job que toque aquele módulo mudaria o locale do
    // processo. O parser não pode depender disso.
    await import("@/lib/market/window");
    expect(
      parseVlrDayTime("Thu, September 3, 2026", "2:00 PM")?.toISOString(),
    ).toBe("2026-09-03T18:00:00.000Z");
  });
});
