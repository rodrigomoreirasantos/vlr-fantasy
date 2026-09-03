// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "@/lib/db/errors";

/** O formato real: o Drizzle embrulha o erro do `pg` e o pendura em `cause`. */
function drizzleWrapped(code: string): Error {
  return Object.assign(new Error("Failed query: insert into ..."), {
    cause: Object.assign(new Error("duplicate key value"), { code }),
  });
}

describe("isUniqueViolation", () => {
  it("reconhece o erro cru do `pg`", () => {
    expect(
      isUniqueViolation(Object.assign(new Error("dup"), { code: "23505" })),
    ).toBe(true);
  });

  it("reconhece o erro EMBRULHADO pelo Drizzle — o formato que chega na prática", () => {
    expect(isUniqueViolation(drizzleWrapped("23505"))).toBe(true);
  });

  it("outro código de erro do Postgres não é violação de unique", () => {
    expect(isUniqueViolation(drizzleWrapped("23503"))).toBe(false);
    expect(
      isUniqueViolation(Object.assign(new Error("x"), { code: "42P01" })),
    ).toBe(false);
  });

  it("não confunde erro comum, null ou string com violação", () => {
    expect(isUniqueViolation(new Error("conexão perdida"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });

  it("uma cadeia de `cause` cíclica não trava", () => {
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(isUniqueViolation(a)).toBe(false);
  });
});
