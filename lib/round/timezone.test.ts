// @vitest-environment node
import { describe, expect, it } from "vitest";

import { GAME_DAY_TZ } from "@/lib/round/day";
import {
  DISPLAY_FALLBACK_TZ,
  guessBrowserTimezone,
  parseTimezone,
} from "@/lib/round/timezone";

describe("parseTimezone", () => {
  it("aceita um fuso IANA válido", () => {
    expect(parseTimezone("America/Sao_Paulo")).toBe("America/Sao_Paulo");
    expect(parseTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("aceita um apelido legado (fora de Intl.supportedValuesOf)", () => {
    expect(parseTimezone("Asia/Calcutta")).toBe("Asia/Calcutta");
  });

  it("devolve null para fuso inválido, sem lançar", () => {
    expect(parseTimezone("Foo/Bar")).toBeNull();
  });

  it("devolve null para entrada vazia ou de outro tipo, sem lançar", () => {
    expect(parseTimezone("")).toBeNull();
    expect(parseTimezone(undefined)).toBeNull();
    expect(parseTimezone(42)).toBeNull();
    expect(parseTimezone({})).toBeNull();
  });
});

describe("guessBrowserTimezone", () => {
  it("devolve um fuso válido (o do processo Node em teste) ou null", () => {
    // Ambiente de teste roda com TZ=UTC (vitest.config.ts) — o importante é
    // que a função nunca lance, não qual fuso especificamente.
    const guessed = guessBrowserTimezone();
    expect(guessed === null || typeof guessed === "string").toBe(true);
  });
});

describe("DISPLAY_FALLBACK_TZ", () => {
  it("é América/São_Paulo — o comportamento de hoje quando o fuso é desconhecido", () => {
    expect(DISPLAY_FALLBACK_TZ).toBe("America/Sao_Paulo");
  });

  it("é uma constante independente de GAME_DAY_TZ, mesmo tendo o mesmo valor hoje", () => {
    // Os dois coincidem porque o público é o mesmo — não porque um derive do
    // outro. São conceitos diferentes (exibição vs. regra de negócio) e podem
    // divergir no futuro sem que isso quebre nada: por isso o literal é
    // repetido em `lib/round/timezone.ts`, e não importado de `lib/round/day.ts`.
    expect(DISPLAY_FALLBACK_TZ).toBe(GAME_DAY_TZ);
  });
});
