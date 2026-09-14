import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandingsPodium } from "@/components/championship/standings-podium";
import { DEFAULT_CREST } from "@/lib/crest/crest";
import type { RankedStanding } from "@/lib/championship/types";

function row(overrides: Partial<RankedStanding>): RankedStanding {
  return {
    userId: "user-1",
    userName: "Rodrigo",
    username: "rodrigo",
    teamName: "Rodrigo FC",
    crest: DEFAULT_CREST,
    points: 0,
    position: 1,
    isCurrentUser: false,
    ...overrides,
  };
}

describe("StandingsPodium", () => {
  it("mostra os 3 primeiros com time, login e pontuação", () => {
    render(
      <StandingsPodium
        standings={[
          row({ userId: "a", teamName: "Time 1", username: "um", points: 90, position: 1 }),
          row({ userId: "b", teamName: "Time 2", username: "dois", points: 80, position: 2 }),
          row({ userId: "c", teamName: "Time 3", username: "tres", points: 70, position: 3 }),
          row({ userId: "d", teamName: "Time 4", points: 60, position: 4 }),
        ]}
      />,
    );

    expect(screen.getByText("Time 1")).toBeInTheDocument();
    expect(screen.getByText("Time 2")).toBeInTheDocument();
    expect(screen.getByText("Time 3")).toBeInTheDocument();
    expect(screen.getByText("90.0")).toBeInTheDocument();
    // Fora do pódio — vive na lista, não aqui.
    expect(screen.queryByText("Time 4")).not.toBeInTheDocument();
  });

  it("empate em 2º: um card só na posição, avisando quantos empataram", () => {
    render(
      <StandingsPodium
        standings={[
          row({ userId: "a", teamName: "Time 1", points: 9, position: 1 }),
          row({ userId: "b", teamName: "Time 2", position: 2 }),
          row({ userId: "c", teamName: "Time 3", position: 2 }),
          row({ userId: "d", teamName: "Time 4", position: 2 }),
        ]}
      />,
    );

    expect(screen.getByText("Time 2")).toBeInTheDocument();
    expect(screen.getAllByText("2º")).toHaveLength(1);
    expect(screen.getByText("+2 empatados")).toBeInTheDocument();
    // Os outros empatados seguem na lista (StandingsList), não aqui.
    expect(screen.queryByText("Time 3")).not.toBeInTheDocument();
    expect(screen.queryByText("Time 4")).not.toBeInTheDocument();
  });

  it("todo mundo empatado (ex.: começo da rodada, todos com 0): sem pódio", () => {
    const { container } = render(
      <StandingsPodium
        standings={[
          row({ userId: "a", teamName: "Time 1", position: 1 }),
          row({ userId: "b", teamName: "Time 2", position: 1 }),
          row({ userId: "c", teamName: "Time 3", position: 1 }),
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("com menos de 3 membros, mostra só quem existe", () => {
    render(
      <StandingsPodium
        standings={[row({ userId: "a", teamName: "Time Único", position: 1 })]}
      />,
    );

    expect(screen.getByText("Time Único")).toBeInTheDocument();
    expect(screen.queryByText("2º")).not.toBeInTheDocument();
  });

  it("marca a linha do usuário atual com 'Você'", () => {
    render(
      <StandingsPodium
        standings={[
          row({ userId: "a", teamName: "Time 1", position: 1, isCurrentUser: true }),
          row({ userId: "b", teamName: "Time 2", position: 2 }),
        ]}
      />,
    );

    expect(screen.getByText("Você")).toBeInTheDocument();
  });

  it("sem ninguém no campeonato, não renderiza nada", () => {
    const { container } = render(<StandingsPodium standings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
