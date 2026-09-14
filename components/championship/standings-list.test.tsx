import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandingsList } from "@/components/championship/standings-list";
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
    position: 4,
    isCurrentUser: false,
    ...overrides,
  };
}

describe("StandingsList", () => {
  it("começa no 4º lugar — o pódio fica em StandingsPodium", () => {
    render(
      <StandingsList
        standings={[
          row({ userId: "a", teamName: "Time 1", position: 1 }),
          row({ userId: "b", teamName: "Time 2", position: 2 }),
          row({ userId: "c", teamName: "Time 3", position: 3 }),
          row({ userId: "d", teamName: "Time 4", position: 4, points: 12.3 }),
        ]}
      />,
    );

    expect(screen.queryByText("Time 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Time 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Time 3")).not.toBeInTheDocument();
    expect(screen.getByText("Time 4")).toBeInTheDocument();
    expect(screen.getByText("12.3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("empatados com quem está no pódio aparecem na lista, com a posição real", () => {
    render(
      <StandingsList
        standings={[
          row({ userId: "a", teamName: "Time 1", points: 9, position: 1 }),
          row({ userId: "b", teamName: "Time 2", position: 2 }),
          row({ userId: "c", teamName: "Time 3", position: 2 }),
        ]}
      />,
    );

    expect(screen.queryByText("Time 2")).not.toBeInTheDocument();
    const tiedRow = screen.getByText("Time 3").closest("li");
    expect(tiedRow).toHaveTextContent("2");
  });

  it("todo mundo empatado: a lista mostra o campeonato inteiro", () => {
    render(
      <StandingsList
        standings={[
          row({ userId: "a", teamName: "Time 1", position: 1 }),
          row({ userId: "b", teamName: "Time 2", position: 1 }),
          row({ userId: "c", teamName: "Time 3", position: 1 }),
        ]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("mostra travessão quando o membro não tem login", () => {
    render(
      <StandingsList
        standings={[row({ userId: "a", username: null, position: 4 })]}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("marca a linha do usuário atual com 'Você'", () => {
    render(
      <StandingsList
        standings={[
          row({ userId: "a", teamName: "Time A", position: 4, isCurrentUser: true }),
          row({ userId: "b", teamName: "Time B", position: 5 }),
        ]}
      />,
    );

    const currentUserRow = screen.getByText("Time A").closest("li");
    expect(currentUserRow).toHaveTextContent("Você");
    const otherRow = screen.getByText("Time B").closest("li");
    expect(otherRow).not.toHaveTextContent("Você");
  });

  it("com todo mundo no pódio (3 membros ou menos), não renderiza nada", () => {
    const { container } = render(
      <StandingsList
        standings={[
          row({ userId: "a", teamName: "Time 1", position: 1 }),
          row({ userId: "b", teamName: "Time 2", position: 2 }),
          row({ userId: "c", teamName: "Time 3", position: 3 }),
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
