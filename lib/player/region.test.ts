// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  latestLeagueAppearance,
  organizationRegions,
  resolvePlayerRegion,
} from "@/lib/player/region";

describe("latestLeagueAppearance", () => {
  it("vazio devolve null", () => {
    expect(latestLeagueAppearance([])).toBeNull();
  });

  it("a aparição mais recente vence", () => {
    const result = latestLeagueAppearance([
      { region: "americas", at: new Date("2026-01-01T00:00:00Z") },
      { region: "emea", at: new Date("2026-03-01T00:00:00Z") },
      { region: "pacific", at: new Date("2026-02-01T00:00:00Z") },
    ]);

    expect(result).toEqual({
      region: "emea",
      at: new Date("2026-03-01T00:00:00Z"),
    });
  });

  it("empate de instante é determinístico — a última da lista vence", () => {
    const at = new Date("2026-03-01T00:00:00Z");
    const result = latestLeagueAppearance([
      { region: "americas", at },
      { region: "emea", at },
    ]);

    expect(result?.region).toBe("emea");
  });
});

describe("organizationRegions", () => {
  it("mapeia cada organização para a liga da partida mais recente dela", () => {
    const map = organizationRegions([
      {
        teamA: "FNATIC",
        teamB: "Team Liquid",
        region: "emea",
        at: new Date("2026-01-01T00:00:00Z"),
      },
      {
        teamA: "FNATIC",
        teamB: "KOI",
        region: "emea",
        at: new Date("2026-02-01T00:00:00Z"),
      },
    ]);

    expect(map.get("FNATIC")).toBe("emea");
    expect(map.get("Team Liquid")).toBe("emea");
    expect(map.get("KOI")).toBe("emea");
  });

  it("dos dois lados da partida, os dois recebem a liga", () => {
    const map = organizationRegions([
      {
        teamA: "LOUD",
        teamB: "NRG",
        region: "americas",
        at: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    expect(map.get("LOUD")).toBe("americas");
    expect(map.get("NRG")).toBe("americas");
  });

  it("sem partidas, mapa vazio", () => {
    expect(organizationRegions([]).size).toBe(0);
  });
});

describe("resolvePlayerRegion — a cascata", () => {
  it("liga própria mais recente vence, mesmo com organização disponível", () => {
    const result = resolvePlayerRegion({
      own: [{ region: "pacific", at: new Date("2026-01-01T00:00:00Z") }],
      organization: "americas",
    });

    expect(result).toEqual({
      region: "pacific",
      sourceAt: new Date("2026-01-01T00:00:00Z"),
    });
  });

  it("sem histórico próprio, empresta a liga da organização", () => {
    const result = resolvePlayerRegion({ own: [], organization: "emea" });

    expect(result).toEqual({ region: "emea", sourceAt: null });
  });

  it("sem histórico próprio e sem organização conhecida, cai em 'other'", () => {
    const result = resolvePlayerRegion({ own: [], organization: null });

    expect(result).toEqual({ region: "other", sourceAt: null });
  });

  it("um evento não reconhecido no histórico não derruba a liga própria — quem chama já filtrou por isLeagueRegion", () => {
    // `own` só recebe aparições JÁ filtradas para liga (isLeagueRegion) —
    // este teste documenta que a função não recebe "other"/"international"
    // aqui, é quem monta `own` que garante isso.
    const result = resolvePlayerRegion({
      own: [{ region: "china", at: new Date("2026-05-01T00:00:00Z") }],
      organization: "americas",
    });

    expect(result.region).toBe("china");
  });
});
