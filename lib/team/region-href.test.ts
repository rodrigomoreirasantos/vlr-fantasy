// @vitest-environment node
import { describe, expect, it } from "vitest";

import { regionHref } from "@/lib/team/region-href";

describe("regionHref", () => {
  it("sem parâmetros, monta só a região", () => {
    expect(regionHref("/home", "emea")).toBe("/home?region=emea");
  });

  it("preserva os demais parâmetros e troca só a região, a partir de um Record", () => {
    expect(
      regionHref("/my-team", "emea", { region: "americas", ordem: "preco" }),
    ).toBe("/my-team?ordem=preco&region=emea");
  });

  it("preserva os demais parâmetros a partir de um URLSearchParams", () => {
    expect(regionHref("/ranking", "emea", new URLSearchParams("c=abc"))).toBe(
      "/ranking?c=abc&region=emea",
    );
  });

  it("região já presente na query não duplica", () => {
    const href = regionHref(
      "/my-team",
      "emea",
      new URLSearchParams("region=americas"),
    );
    expect(href).toBe("/my-team?region=emea");
  });

  it("valor repetido sobrevive nos dois formatos", () => {
    expect(regionHref("/ranking", "emea", { tag: ["a", "b"] })).toBe(
      "/ranking?tag=a&tag=b&region=emea",
    );

    expect(
      regionHref("/ranking", "emea", new URLSearchParams("tag=a&tag=b")),
    ).toBe("/ranking?tag=a&tag=b&region=emea");
  });
});
