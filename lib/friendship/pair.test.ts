import { describe, expect, it } from "vitest";

import { canonicalPair } from "@/lib/friendship/pair";

describe("canonicalPair", () => {
  it("é simétrico: a mesma dupla em qualquer ordem gera o mesmo par", () => {
    expect(canonicalPair("a", "b")).toEqual(canonicalPair("b", "a"));
  });

  it("ordena os ids dentro do par", () => {
    expect(canonicalPair("b", "a")).toEqual({ userAId: "a", userBId: "b" });
  });

  it("null para autopedido (mesmo id)", () => {
    expect(canonicalPair("a", "a")).toBeNull();
  });
});
