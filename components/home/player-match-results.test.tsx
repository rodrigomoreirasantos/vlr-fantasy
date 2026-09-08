import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlayerMatchResults } from "@/components/home/player-match-results";
import type { PlayerMatchPerformance } from "@/lib/player/types";

function performance(
  overrides: Partial<PlayerMatchPerformance> = {},
): PlayerMatchPerformance {
  return {
    playerId: "aspas",
    nickname: "aspas",
    team: "LEVIATÁN",
    matchId: "m1",
    event: "VCT 2026: Americas Stage 2",
    scheduledAt: new Date("2026-09-03T21:00:00Z"),
    teamA: "LEVIATÁN",
    teamB: "LOUD",
    scoreA: 2,
    scoreB: 1,
    status: "finished",
    points: 24.5,
    kills: 40,
    deaths: 20,
    assists: 8,
    acs: 245.4,
    rating: 1.23,
    mapsWon: 2,
    mapsPlayed: 3,
    ...overrides,
  };
}

describe("PlayerMatchResults", () => {
  it("estado vazio: nenhuma partida pontuada", () => {
    render(
      <PlayerMatchResults
        performances={[]}
        rosterSize={5}
        selectedPlayerId={null}
      />,
    );

    expect(
      screen.getByText(
        "Nenhuma partida dos seus jogadores foi pontuada ainda.",
      ),
    ).toBeInTheDocument();
  });

  it("estado vazio de um jogador escolhido fala dele, não do time", () => {
    render(
      <PlayerMatchResults
        performances={[performance()]}
        rosterSize={5}
        selectedPlayerId="tenz"
      />,
    );

    expect(
      screen.getByText("Este jogador ainda não tem partida pontuada."),
    ).toBeInTheDocument();
  });

  it("mostra o placar, a região e a linha de stats do jogador", () => {
    render(
      <PlayerMatchResults
        performances={[performance()]}
        rosterSize={5}
        selectedPlayerId={null}
      />,
    );

    const [item] = screen.getAllByRole("listitem");
    // A organização aparece duas vezes de propósito: no placar e ao lado do
    // jogador, que é o que distingue os lados quando dois dos seus se
    // enfrentam.
    expect(within(item!).getAllByText("LEVIATÁN")).toHaveLength(2);
    expect(within(item!).getByText("LOUD")).toBeInTheDocument();
    expect(within(item!).getByText("Americas")).toBeInTheDocument();
    expect(within(item!).getByText("40/20/8")).toBeInTheDocument();
    expect(within(item!).getByText("ACS 245")).toBeInTheDocument();
    expect(within(item!).getByText("2/3 mapas")).toBeInTheDocument();
  });

  it("dois dos seus na mesma partida dão um placar só, com os dois nomes", () => {
    render(
      <PlayerMatchResults
        performances={[
          performance({
            playerId: "aspas",
            nickname: "aspas",
            team: "LEVIATÁN",
          }),
          performance({ playerId: "sacy", nickname: "Sacy", team: "LOUD" }),
        ]}
        rosterSize={5}
        selectedPlayerId={null}
      />,
    );

    // Uma partida na lista de fora — não duas com o mesmo 2 × 1.
    const matches = screen
      .getAllByRole("listitem")
      .filter((item) => within(item).queryByText("Americas"));
    expect(matches).toHaveLength(1);

    expect(screen.getByText("aspas")).toBeInTheDocument();
    expect(screen.getByText("Sacy")).toBeInTheDocument();
  });

  it("partidas diferentes continuam sendo cartões diferentes", () => {
    render(
      <PlayerMatchResults
        performances={[
          performance({ matchId: "m1" }),
          performance({
            matchId: "m2",
            playerId: "tenz",
            nickname: "TenZ",
            team: "SENTINELS",
            teamA: "SENTINELS",
            teamB: "NRG",
            scheduledAt: new Date("2026-09-02T21:00:00Z"),
          }),
        ]}
        rosterSize={5}
        selectedPlayerId={null}
      />,
    );

    const matches = screen
      .getAllByRole("listitem")
      .filter((item) => within(item).queryByText("Americas"));
    expect(matches).toHaveLength(2);
  });

  it("resume em uma frase o que aconteceu com os seus", () => {
    render(
      <PlayerMatchResults
        performances={[
          performance({
            playerId: "aspas",
            nickname: "aspas",
            team: "LEVIATÁN",
          }),
          performance({ playerId: "sacy", nickname: "Sacy", team: "LOUD" }),
        ]}
        rosterSize={5}
        selectedPlayerId={null}
      />,
    );

    expect(
      screen.getByText(
        "2 dos seus 5 jogaram: 1 vitória e 1 derrota, 49.0 pontos somados. Melhor: aspas (24.5).",
      ),
    ).toBeInTheDocument();
  });

  it("escolher um jogador deixa só as partidas dele", () => {
    render(
      <PlayerMatchResults
        performances={[
          performance({ matchId: "m1" }),
          performance({
            matchId: "m2",
            playerId: "tenz",
            nickname: "TenZ",
            team: "SENTINELS",
            teamA: "SENTINELS",
            teamB: "NRG",
          }),
        ]}
        rosterSize={5}
        selectedPlayerId="tenz"
      />,
    );

    expect(screen.getByText("TenZ")).toBeInTheDocument();
    expect(screen.queryByText("aspas")).not.toBeInTheDocument();
  });

  it("partida ao vivo é anunciada, e sem placar não inventa um", () => {
    render(
      <PlayerMatchResults
        performances={[
          performance({ status: "live", scoreA: null, scoreB: null }),
        ]}
        rosterSize={5}
        selectedPlayerId={null}
      />,
    );

    expect(screen.getByText("Ao vivo")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("série sem scoreboard mostra traço, não zero", () => {
    render(
      <PlayerMatchResults
        performances={[
          performance({ kills: null, deaths: null, assists: null, acs: null }),
        ]}
        rosterSize={5}
        selectedPlayerId={null}
      />,
    );

    expect(screen.getByText("—/—/—")).toBeInTheDocument();
    expect(screen.queryByText("0/0/0")).not.toBeInTheDocument();
  });

  it("pontuação negativa aparece com sinal de menos", () => {
    render(
      <PlayerMatchResults
        performances={[performance({ points: -3.5 })]}
        rosterSize={5}
        selectedPlayerId={null}
      />,
    );

    expect(screen.getByText("−3.5")).toBeInTheDocument();
  });
});
