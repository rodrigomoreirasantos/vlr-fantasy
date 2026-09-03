import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NextRoundBrief } from "@/components/home/next-round-brief";
import type { NextRoundBrief as NextRoundBriefData } from "@/lib/home/types";

function brief(
  overrides: Partial<NextRoundBriefData> = {},
): NextRoundBriefData {
  return {
    roundNumber: 4,
    marketOpensAt: new Date("2026-03-10T00:00:00Z"),
    marketClosesAt: new Date("2026-03-14T18:00:00Z"),
    marketCountdown: "Mercado fecha em 36h 12m",
    alerts: [],
    ...overrides,
  };
}

describe("NextRoundBrief", () => {
  it("estado vazio: nenhuma rodada agendada", () => {
    render(<NextRoundBrief nextRound={null} />);

    expect(
      screen.getByText("Nenhuma rodada agendada no momento."),
    ).toBeInTheDocument();
  });

  it("sem alertas: confirma os 5 jogadores", () => {
    render(<NextRoundBrief nextRound={brief()} />);

    expect(
      screen.getByText("Seus 5 jogadores estão confirmados."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("com alertas: mostra o aviso no lugar da confirmação", () => {
    render(
      <NextRoundBrief
        nextRound={brief({
          alerts: [{ position: 2, message: "TenZ não deve jogar (Reserva)." }],
        })}
      />,
    );

    expect(
      screen.getByText("TenZ não deve jogar (Reserva)."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Seus 5 jogadores estão confirmados."),
    ).not.toBeInTheDocument();
  });

  it("mostra o número da rodada e o estado do mercado vindo do servidor", () => {
    render(<NextRoundBrief nextRound={brief()} />);

    expect(screen.getByText("Sua rodada 4")).toBeInTheDocument();
    expect(screen.getByText("Mercado fecha em 36h 12m")).toBeInTheDocument();
  });
});
