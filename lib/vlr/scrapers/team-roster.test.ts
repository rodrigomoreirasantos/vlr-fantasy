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

  it("lê a foto do jogador, já normalizada para https", () => {
    const captain = roster.players.find((row) => row.vlrId === "22381")!;
    expect(captain.photoUrl).toBe("https://owcdn.net/img/668b9efe31f02.png");
  });

  it("a silhueta padrão do vlr (sem foto de verdade) vira null", () => {
    const yuno = roster.players.find((row) => row.vlrId === "49871")!;
    expect(yuno.photoUrl).toBeNull();
  });

  it("uma página sem elenco lança SelectorMissError", () => {
    expect(() =>
      parseTeamRoster("<html><body></body></html>", "17037"),
    ).toThrow(SelectorMissError);
  });

  it("jogador emprestado ('loan') continua jogador — a tag de status não é a de staff", () => {
    // Verificado ao vivo contra vlr.gg/team/6961 (LOUD): o vlr usa a MESMA
    // classe `.team-roster-item-name-role` para o cargo de staff ("head
    // coach") e para o status de um jogador na própria seção de players
    // ("loan"). Filtrar por essa tag excluía jogador emprestado como se
    // fosse funcionário — o caso real foi o jogador "tkzin".
    const html = `
      <html><body>
        <h2 class="team-header-name"><span class="wf-title">Time</span></h2>
        <div class="wf-card">
          <div class="wf-module-label">players</div>
          <div>
            <div class="team-roster-item">
              <a href="/player/41224/tkzin">
                <div class="team-roster-item-img"><img src="//owcdn.net/img/x.png"></div>
                <div class="team-roster-item-name">
                  <div class="team-roster-item-name-alias">tkzin</div>
                  <div class="team-roster-item-name-real">Enzo Zimiani</div>
                  <div class="wf-tag mod-light team-roster-item-name-role">loan</div>
                </div>
              </a>
            </div>
          </div>
          <div class="wf-module-label">staff</div>
          <div>
            <div class="team-roster-item">
              <a href="/player/58032/linus">
                <div class="team-roster-item-img"><img src="//owcdn.net/img/y.png"></div>
                <div class="team-roster-item-name">
                  <div class="team-roster-item-name-alias">Linus</div>
                  <div class="wf-tag mod-light team-roster-item-name-role">head coach</div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </body></html>
    `;

    const withLoan = parseTeamRoster(html, "6961");

    expect(withLoan.players.some((row) => row.vlrId === "41224")).toBe(true);
    expect(withLoan.players.find((row) => row.vlrId === "41224")?.nickname).toBe(
      "tkzin",
    );
    // Staff continua fora, mesmo com a mesma tag no mesmo rótulo de classe.
    expect(withLoan.players.some((row) => row.vlrId === "58032")).toBe(false);
  });
});
