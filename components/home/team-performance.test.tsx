import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TeamPerformance } from "@/components/home/team-performance";
import type { RoundRecap } from "@/lib/home/types";
import type { PlayerMatchPerformance } from "@/lib/player/types";

const ROSTER = [
  { playerId: "aspas", nickname: "aspas" },
  { playerId: "tenz", nickname: "TenZ" },
];

function recap(overrides: Partial<RoundRecap> = {}): RoundRecap {
  return {
    roundNumber: 3,
    points: 87.4,
    patrimonyCents: 212_500,
    patrimonyDeltaCents: 1250,
    placements: [],
    ...overrides,
  };
}

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

const BOTH = [
  performance(),
  performance({
    playerId: "tenz",
    nickname: "TenZ",
    matchId: "m2",
    team: "SENTINELS",
    teamA: "SENTINELS",
    teamB: "NRG",
  }),
];

describe("TeamPerformance", () => {
  it("o título nomeia o desempenho do time e a rodada", () => {
    render(
      <TeamPerformance
        recap={recap()}
        hasFinishedRound
        performances={[]}
        roster={ROSTER}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Desempenho do seu time — Rodada 3",
      }),
    ).toBeInTheDocument();
  });

  it("sem rodada fechada, o título fica sem número", () => {
    render(
      <TeamPerformance
        recap={null}
        hasFinishedRound={false}
        performances={[]}
        roster={ROSTER}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Desempenho do seu time" }),
    ).toBeInTheDocument();
  });

  it("os três blocos convivem: números, gráfico e placares", () => {
    render(
      <TeamPerformance
        recap={recap()}
        hasFinishedRound
        performances={BOTH}
        roster={ROSTER}
      />,
    );

    // 1. os números da rodada
    expect(screen.getByText("87.4")).toBeInTheDocument();
    expect(screen.getByText("+12.5")).toBeInTheDocument();
    // 2. o gráfico, pela sua tabela acessível
    expect(screen.getByRole("table")).toBeInTheDocument();
    // 3. os placares
    // O denominador é o elenco (5), não as vagas preenchidas.
    expect(screen.getByText(/2 dos seus 5 jogaram/)).toBeInTheDocument();
  });

  it("sem partida nenhuma, não oferece filtro para filtrar nada", () => {
    render(
      <TeamPerformance
        recap={recap()}
        hasFinishedRound
        performances={[]}
        roster={ROSTER}
      />,
    );

    expect(
      screen.queryByRole("group", { name: "Escolher métrica" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("87.4")).toBeInTheDocument();
  });

  it("oferece as cinco métricas, com Pontos ligada por padrão", () => {
    render(
      <TeamPerformance
        recap={recap()}
        hasFinishedRound
        performances={BOTH}
        roster={ROSTER}
      />,
    );

    const metrics = screen.getByRole("group", { name: "Escolher métrica" });
    expect(
      within(metrics)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Pontos", "ACS", "Rating", "Abates", "K/D"]);
    expect(
      within(metrics).getByRole("button", { name: "Pontos" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("trocar a métrica muda os números do gráfico", async () => {
    const user = userEvent.setup();
    render(
      <TeamPerformance
        recap={recap()}
        hasFinishedRound
        performances={BOTH}
        roster={ROSTER}
      />,
    );

    expect(screen.getAllByRole("cell", { name: "24.5" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "ACS" }));

    expect(screen.getAllByRole("cell", { name: "245" })).toHaveLength(2);
    expect(
      screen.queryByRole("cell", { name: "24.5" }),
    ).not.toBeInTheDocument();
  });

  it("o filtro de jogador lista só quem já jogou", () => {
    render(
      <TeamPerformance
        recap={recap()}
        hasFinishedRound
        performances={BOTH}
        roster={[...ROSTER, { playerId: "sacy", nickname: "Sacy" }]}
      />,
    );

    const players = screen.getByRole("group", { name: "Filtrar por jogador" });
    expect(
      within(players)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Todos", "aspas", "TenZ"]);
  });

  it("escolher um jogador recorta gráfico e placares juntos", async () => {
    const user = userEvent.setup();
    render(
      <TeamPerformance
        recap={recap()}
        hasFinishedRound
        performances={BOTH}
        roster={ROSTER}
      />,
    );

    const players = screen.getByRole("group", { name: "Filtrar por jogador" });
    await user.click(within(players).getByRole("button", { name: "TenZ" }));

    expect(
      screen.getAllByRole("rowheader").map((row) => row.textContent),
    ).toEqual(["TenZ"]);
    expect(screen.getByText(/1 dos seus 5 jogou/)).toBeInTheDocument();
  });

  it("com um jogador só em campo, não há por que filtrar por jogador", () => {
    render(
      <TeamPerformance
        recap={recap()}
        hasFinishedRound
        performances={[performance()]}
        roster={ROSTER}
      />,
    );

    expect(
      screen.queryByRole("group", { name: "Filtrar por jogador" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Escolher métrica" }),
    ).toBeInTheDocument();
  });
});
