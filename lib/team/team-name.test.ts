import { describe, expect, it } from "vitest";

import {
  deriveTeamName,
  nextTeamNameCandidate,
  normalizeTeamName,
  teamNameKey,
} from "@/lib/team/team-name";

describe("deriveTeamName", () => {
  it("deriva o nome inicial a partir do login", () => {
    expect(deriveTeamName("rodrigo")).toBe("rodrigo FC");
  });
});

describe("normalizeTeamName", () => {
  it("colapsa espaços internos e remove das bordas", () => {
    expect(normalizeTeamName("  Sentinels   BR  ")).toBe("Sentinels BR");
  });
});

describe("teamNameKey", () => {
  it("iguala nomes que só diferem em espaçamento e maiúsculas", () => {
    expect(teamNameKey("Sentinels BR")).toBe(teamNameKey("  sentinels   br "));
  });

  it("não iguala nomes que diferem em acentuação — o índice do banco também não remove acento", () => {
    expect(teamNameKey("Sentinels BR")).not.toBe(teamNameKey("Sentinéls BR"));
  });
});

describe("nextTeamNameCandidate", () => {
  it("numera a partir de 2", () => {
    expect(nextTeamNameCandidate("rodrigo FC", 2)).toBe("rodrigo FC 2");
    expect(nextTeamNameCandidate("rodrigo FC", 3)).toBe("rodrigo FC 3");
  });
});
