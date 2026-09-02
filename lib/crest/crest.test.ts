import { describe, expect, it } from "vitest";

import { DEFAULT_CREST, defaultCrestFor, parseCrest } from "@/lib/crest/crest";

describe("parseCrest", () => {
  it("preserva todos os campos válidos", () => {
    const raw = {
      shape: "diamond",
      symbol: "flame",
      background: "cyan",
      foreground: "white",
      border: "amber",
    };

    expect(parseCrest(raw)).toEqual(raw);
  });

  it("cai no default campo a campo quando o valor não está no catálogo", () => {
    const raw = {
      shape: "diamond",
      symbol: "valor-removido-do-catalogo",
      background: "cyan",
      foreground: "cor-inexistente",
      border: "amber",
    };

    expect(parseCrest(raw)).toEqual({
      shape: "diamond",
      symbol: DEFAULT_CREST.symbol,
      background: "cyan",
      foreground: DEFAULT_CREST.foreground,
      border: "amber",
    });
  });

  it("brasão totalmente vazio/corrompido cai inteiro no default", () => {
    const raw = {
      shape: "",
      symbol: "",
      background: "",
      foreground: "",
      border: "",
    };

    expect(parseCrest(raw)).toEqual(DEFAULT_CREST);
  });
});

describe("defaultCrestFor", () => {
  it("é determinístico: o mesmo seed sempre gera a mesma composição", () => {
    expect(defaultCrestFor("user-123")).toEqual(defaultCrestFor("user-123"));
  });

  it("seeds diferentes tendem a gerar composições diferentes", () => {
    const a = defaultCrestFor("user-aaaa");
    const b = defaultCrestFor("user-bbbb");

    expect(a).not.toEqual(b);
  });
});
