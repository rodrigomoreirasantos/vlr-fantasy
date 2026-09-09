import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeamStats } from "@/components/team/team-stats";
import type { TeamSummary } from "@/lib/team/types";

function makeSummary(overrides: Partial<TeamSummary> = {}): TeamSummary {
  return {
    name: "Meu Time",
    crest: {
      shape: "shield",
      symbol: "crosshair",
      background: "graphite",
      foreground: "red",
      border: "red",
    },
    points: 42,
    balanceCents: 12_345,
    region: "americas",
    market: { open: true, closesIn: "36h 12m", closesAt: null },
    ...overrides,
  };
}

describe("TeamStats", () => {
  it("mostra o card 'Região' com o rótulo da região do time", () => {
    render(<TeamStats summary={makeSummary({ region: "emea" })} />);

    expect(screen.getByText("Região")).toBeInTheDocument();
    expect(screen.getByText("EMEA")).toBeInTheDocument();
  });

  it("não mostra mais 'Partidas Pontuadas'", () => {
    render(<TeamStats summary={makeSummary()} />);

    expect(screen.queryByText("Partidas Pontuadas")).not.toBeInTheDocument();
  });

  it("mostra os pontos do time", () => {
    render(<TeamStats summary={makeSummary({ points: 42 })} />);

    expect(screen.getByText("42.0")).toBeInTheDocument();
    expect(screen.queryByText("123.4")).not.toBeInTheDocument();
  });
});
