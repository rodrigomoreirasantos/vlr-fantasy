import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MatchList } from "@/components/home/match-list";
import type { RoundMatch } from "@/lib/round/types";

function match(overrides: Partial<RoundMatch> = {}): RoundMatch {
  return {
    id: "match-1",
    teamA: "SENTINELS",
    teamB: "FNATIC",
    event: "VCT Americas",
    scheduledAt: new Date("2026-03-12T21:00:00Z"),
    status: "upcoming",
    scoreA: null,
    scoreB: null,
    ...overrides,
  };
}

describe("MatchList", () => {
  it("estado vazio: nenhuma partida marcada", () => {
    render(<MatchList matches={[]} myOrganizations={[]} />);

    expect(
      screen.getByText("Nenhuma partida marcada para a próxima rodada."),
    ).toBeInTheDocument();
  });

  it("a partida com jogador meu recebe o selo 'Seu jogador'", () => {
    render(
      <MatchList
        matches={[
          match({ id: "match-1", teamA: "SENTINELS", teamB: "FNATIC" }),
          match({ id: "match-2", teamA: "LOUD", teamB: "NRG" }),
        ]}
        myOrganizations={["SENTINELS"]}
      />,
    );

    expect(screen.getAllByText("Seu jogador")).toHaveLength(1);
  });

  it("sem organizações minhas: nenhuma partida recebe o selo", () => {
    render(<MatchList matches={[match()]} myOrganizations={[]} />);

    expect(screen.queryByText("Seu jogador")).not.toBeInTheDocument();
  });
});
