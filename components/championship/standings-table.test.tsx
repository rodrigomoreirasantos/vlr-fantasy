import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandingsTable } from "@/components/championship/standings-table";
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

describe("StandingsTable", () => {
  it("mostra posição, time, login e pontuação de cada linha", () => {
    render(
      <StandingsTable
        standings={[
          row({
            userId: "a",
            teamName: "Rodrigo FC",
            username: "rodrigo",
            points: 78.5,
            position: 1,
          }),
        ]}
      />,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Rodrigo FC")).toBeInTheDocument();
    expect(screen.getByText("@rodrigo")).toBeInTheDocument();
    expect(screen.getByText("78.5")).toBeInTheDocument();
  });

  it("mostra travessão quando o membro não tem login", () => {
    render(
      <StandingsTable
        standings={[row({ userId: "a", username: null, points: 10 })]}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("destaca a linha do usuário atual", () => {
    render(
      <StandingsTable
        standings={[
          row({ userId: "a", teamName: "Time A", isCurrentUser: true }),
          row({ userId: "b", teamName: "Time B", isCurrentUser: false }),
        ]}
      />,
    );

    const currentUserRow = screen.getByText("Time A").closest("tr");
    const otherRow = screen.getByText("Time B").closest("tr");

    expect(currentUserRow?.className).toMatch(/ring-primary/);
    expect(otherRow?.className).not.toMatch(/ring-primary/);
  });
});
