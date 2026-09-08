import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoundRecap } from "@/components/home/round-recap";
import type { RoundRecap as RoundRecapData } from "@/lib/home/types";

function recap(overrides: Partial<RoundRecapData> = {}): RoundRecapData {
  return {
    roundNumber: 3,
    points: 87.4,
    patrimonyCents: 212_500,
    patrimonyDeltaCents: 1250,
    placements: [
      {
        championship: {
          id: "champ-1",
          name: "Liga dos Cria",
          ownerId: "user-1",
          region: "americas",
          memberCount: 6,
        },
        position: 2,
        points: 64.0,
        change: 1,
      },
    ],
    ...overrides,
  };
}

describe("RoundRecap", () => {
  it("estado vazio: nenhuma rodada fechada ainda", () => {
    render(<RoundRecap recap={null} hasFinishedRound={false} />);

    expect(
      screen.getByText("A primeira rodada ainda não foi fechada."),
    ).toBeInTheDocument();
  });

  it("time entrou depois do fechamento: não diz que a rodada não foi fechada", () => {
    render(<RoundRecap recap={null} hasFinishedRound />);

    expect(
      screen.getByText(
        "Seu time ainda não disputou uma rodada fechada. A próxima já conta.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("A primeira rodada ainda não foi fechada."),
    ).not.toBeInTheDocument();
  });

  it("mostra os pontos do time, a variação de patrimônio e a colocação", () => {
    render(<RoundRecap recap={recap()} hasFinishedRound />);

    expect(screen.getByText("87.4")).toBeInTheDocument();
    expect(screen.getByText("+12.5")).toBeInTheDocument();
    expect(screen.getByText("2º")).toBeInTheDocument();
    expect(screen.getByText("Liga dos Cria")).toBeInTheDocument();
  });

  it("sem rodada anterior: não mostra variação de patrimônio", () => {
    render(
      <RoundRecap
        recap={recap({ patrimonyDeltaCents: null })}
        hasFinishedRound
      />,
    );

    expect(screen.queryByText(/^[+−]/)).not.toBeInTheDocument();
  });
});
