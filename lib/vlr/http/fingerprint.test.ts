// @vitest-environment node
import { describe, expect, it } from "vitest";

import { fingerprint } from "@/lib/vlr/http/fingerprint";

describe("fingerprint", () => {
  it("é estável à ordem das chaves do objeto", () => {
    const a = fingerprint({ a: 1, b: 2, c: [1, 2, 3] });
    const b = fingerprint({ c: [1, 2, 3], b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("é estável à ordem das chaves em objetos aninhados", () => {
    const a = fingerprint({ outer: { x: 1, y: 2 } });
    const b = fingerprint({ outer: { y: 2, x: 1 } });
    expect(a).toBe(b);
  });

  it("muda com qualquer valor diferente", () => {
    const a = fingerprint({ score: 10 });
    const b = fingerprint({ score: 11 });
    expect(a).not.toBe(b);
  });

  it("trata Date como o mesmo valor de sempre, via ISO", () => {
    const a = fingerprint({ at: new Date("2026-09-10T12:00:00Z") });
    const b = fingerprint({ at: new Date("2026-09-10T12:00:00Z") });
    expect(a).toBe(b);
  });

  it("é sensível à ordem dos elementos de um array", () => {
    const a = fingerprint([1, 2, 3]);
    const b = fingerprint([3, 2, 1]);
    expect(a).not.toBe(b);
  });

  it("devolve um hex de 64 caracteres (SHA-256)", () => {
    expect(fingerprint({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
