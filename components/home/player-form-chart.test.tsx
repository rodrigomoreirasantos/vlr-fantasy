import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlayerFormChart } from "@/components/home/player-form-chart";
import type { PlayerMatchPerformance } from "@/lib/player/types";

const ROSTER = [
  { playerId: "aspas", nickname: "aspas", photoUrl: null },
  { playerId: "tenz", nickname: "TenZ", photoUrl: null },
];

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
    photoUrl: null,
    ...overrides,
  };
}

/** A linha da tabela acessível de um jogador — o que o leitor de tela ouve. */
function rowOf(nickname: string) {
  return screen.getByRole("rowheader", { name: nickname }).closest("tr")!;
}

describe("PlayerFormChart", () => {
  it("estado vazio: ninguém entrou em quadra ainda", () => {
    render(
      <PlayerFormChart
        performances={[]}
        roster={ROSTER}
        metric="points"
        selectedPlayerId={null}
      />,
    );

    expect(
      screen.getByText(/Nenhum dos seus jogadores entrou em quadra ainda/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("os números do gráfico ficam legíveis numa tabela", () => {
    render(
      <PlayerFormChart
        performances={[
          performance({
            matchId: "a",
            points: 10,
            scheduledAt: new Date("2026-09-01T00:00:00Z"),
          }),
          performance({
            matchId: "b",
            points: 30,
            scheduledAt: new Date("2026-09-03T00:00:00Z"),
          }),
        ]}
        roster={ROSTER}
        metric="points"
        selectedPlayerId={null}
      />,
    );

    const cells = within(rowOf("aspas")).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["10", "30"]);
  });

  it("o eixo é a recência: 'J-1' e 'Último'", () => {
    render(
      <PlayerFormChart
        performances={[
          performance({
            matchId: "a",
            scheduledAt: new Date("2026-09-01T00:00:00Z"),
          }),
          performance({
            matchId: "b",
            scheduledAt: new Date("2026-09-03T00:00:00Z"),
          }),
        ]}
        roster={ROSTER}
        metric="points"
        selectedPlayerId={null}
      />,
    );

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual(["Jogador", "J-1", "Último"]);
  });

  it("trocar a métrica troca os números", () => {
    const rows = [performance({ acs: 245.4, kills: 40 })];

    const { rerender } = render(
      <PlayerFormChart
        performances={rows}
        roster={ROSTER}
        metric="points"
        selectedPlayerId={null}
      />,
    );
    expect(within(rowOf("aspas")).getByRole("cell").textContent).toBe("24.5");

    rerender(
      <PlayerFormChart
        performances={rows}
        roster={ROSTER}
        metric="acs"
        selectedPlayerId={null}
      />,
    );
    expect(within(rowOf("aspas")).getByRole("cell").textContent).toBe("245");

    rerender(
      <PlayerFormChart
        performances={rows}
        roster={ROSTER}
        metric="kills"
        selectedPlayerId={null}
      />,
    );
    expect(within(rowOf("aspas")).getByRole("cell").textContent).toBe("40");
  });

  it("a legenda da tabela nomeia a métrica em pt-BR", () => {
    render(
      <PlayerFormChart
        performances={[performance()]}
        roster={ROSTER}
        metric="rating"
        selectedPlayerId={null}
      />,
    );

    expect(
      screen.getByText("Rating por partida, do mais antigo ao mais recente"),
    ).toBeInTheDocument();
  });

  it("escolher um jogador deixa só a linha dele", () => {
    const rows = [
      performance({ playerId: "aspas", nickname: "aspas" }),
      performance({
        playerId: "tenz",
        nickname: "TenZ",
        matchId: "m2",
        team: "SENTINELS",
        teamA: "SENTINELS",
        teamB: "NRG",
      }),
    ];

    const { rerender } = render(
      <PlayerFormChart
        performances={rows}
        roster={ROSTER}
        metric="points"
        selectedPlayerId={null}
      />,
    );
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);

    rerender(
      <PlayerFormChart
        performances={rows}
        roster={ROSTER}
        metric="points"
        selectedPlayerId="tenz"
      />,
    );
    expect(
      screen.getAllByRole("rowheader").map((row) => row.textContent),
    ).toEqual(["TenZ"]);
  });

  it("quem jogou menos deixa buraco, e a tabela diz que foi buraco", () => {
    render(
      <PlayerFormChart
        performances={[
          performance({
            playerId: "aspas",
            nickname: "aspas",
            matchId: "a",
            scheduledAt: new Date("2026-09-01T00:00:00Z"),
          }),
          performance({
            playerId: "aspas",
            nickname: "aspas",
            matchId: "b",
            scheduledAt: new Date("2026-09-03T00:00:00Z"),
          }),
          performance({
            playerId: "tenz",
            nickname: "TenZ",
            matchId: "c",
            team: "SENTINELS",
            teamA: "SENTINELS",
            teamB: "NRG",
            scheduledAt: new Date("2026-09-02T00:00:00Z"),
          }),
        ]}
        roster={ROSTER}
        metric="points"
        selectedPlayerId={null}
      />,
    );

    const cells = within(rowOf("TenZ"))
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["sem jogo", "24.5"]);
  });

  it("stat ausente no scoreboard não vira zero", () => {
    render(
      <PlayerFormChart
        performances={[performance({ acs: null })]}
        roster={ROSTER}
        metric="acs"
        selectedPlayerId={null}
      />,
    );

    expect(within(rowOf("aspas")).getByRole("cell").textContent).toBe(
      "sem jogo",
    );
  });
});
