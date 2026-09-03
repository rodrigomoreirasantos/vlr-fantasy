// @vitest-environment node
import { describe, expect, it } from "vitest";

import { weekKeyOf, weekStartOf } from "@/lib/vlr/normalize/week";

describe("weekKeyOf", () => {
  it("devolve a semana ISO com dois dígitos", () => {
    expect(weekKeyOf(new Date("2026-09-02T21:00:00Z"))).toBe("2026-W36");
    expect(weekKeyOf(new Date("2026-01-08T12:00:00Z"))).toBe("2026-W02");
  });

  it("segunda e domingo da mesma semana compartilham a chave", () => {
    const monday = new Date("2026-08-31T00:00:00Z");
    const sunday = new Date("2026-09-06T23:59:00Z");
    expect(weekKeyOf(monday)).toBe(weekKeyOf(sunday));
  });

  it("a virada de ano usa o ano ISO: 31/12/2026 e 01/01/2027 são a mesma rodada", () => {
    expect(weekKeyOf(new Date("2026-12-31T12:00:00Z"))).toBe("2026-W53");
    expect(weekKeyOf(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
  });
});

describe("weekStartOf", () => {
  it("é a segunda-feira 00:00 UTC da semana", () => {
    expect(weekStartOf(new Date("2026-09-02T21:00:00Z")).toISOString()).toBe(
      "2026-08-31T00:00:00.000Z",
    );
  });
});
