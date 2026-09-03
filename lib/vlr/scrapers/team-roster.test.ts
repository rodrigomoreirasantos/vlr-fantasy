// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readFixture } from "@/lib/vlr/fixtures/load";
import { SelectorMissError } from "@/lib/vlr/scrapers/parse";
import { parseTeamRoster } from "@/lib/vlr/scrapers/team-roster";

const roster = parseTeamRoster(readFixture("team-roster-17037.html"), "17037");

describe("parseTeamRoster", () => {
  it("lê nome, sigla e região da organização", () => {
    expect(roster.name).toBe("Glacial Guardians");
    expect(roster.tag).toBe("GG");
    expect(roster.region).toBe("de");
  });

  it("lê o vlrId, o nickname e o nome real de cada jogador", () => {
    const yuno = roster.players.find((row) => row.vlrId === "49871")!;
    expect(yuno.nickname).toBe("Yuno");
    expect(yuno.realName).toBe("Muhammet Karacigay");
    expect(yuno.country).toBe("at");
  });

  it("o nickname não carrega a bandeira nem a estrela de capitão", () => {
    const captain = roster.players.find((row) => row.vlrId === "22381")!;
    expect(captain.nickname).toBe("Símplex");
  });

  it("EXCLUI staff: o head coach da página não vira jogador do fantasy", () => {
    // "/player/58032/linus" aparece na página, sob o rótulo "staff".
    expect(roster.players.some((row) => row.vlrId === "58032")).toBe(false);
    expect(roster.players.some((row) => row.nickname === "Linus")).toBe(false);
  });

  it("um jogador sem nome real ainda entra, com realName nulo", () => {
    const kram = roster.players.find((row) => row.vlrId === "61261")!;
    expect(kram.nickname).toBe("Kram");
    expect(kram.realName).toBeNull();
  });

  it("uma página sem elenco lança SelectorMissError", () => {
    expect(() =>
      parseTeamRoster("<html><body></body></html>", "17037"),
    ).toThrow(SelectorMissError);
  });
});
