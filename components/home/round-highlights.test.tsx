import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoundHighlights } from "@/components/home/round-highlights";
import type { RoundHighlights as RoundHighlightsData } from "@/lib/home/types";

function highlights(
  overrides: Partial<RoundHighlightsData> = {},
): RoundHighlightsData {
  return {
    roundNumber: 7,
    partial: false,
    topScorer: {
      playerId: "boaster",
      nickname: "Boaster",
      team: "FNATIC",
      role: "Controlador",
      points: 24.6,
    },
    risers: [
      {
        playerId: "tenz",
        nickname: "TenZ",
        team: "SENTINELS",
        role: "Duelista",
        priceDeltaCents: 750,
      },
    ],
    fallers: [
      {
        playerId: "sacy",
        nickname: "Sacy",
        team: "LOUD",
        role: "Iniciador",
        priceDeltaCents: -300,
      },
    ],
    ...overrides,
  };
}

describe("RoundHighlights", () => {
  it("estado vazio: nenhuma partida pontuada ainda", () => {
    render(<RoundHighlights highlights={null} />);

    expect(
      screen.getByText(
        "Os destaques aparecem assim que a primeira partida for pontuada.",
      ),
    ).toBeInTheDocument();
  });

  it("mostra o maior pontuador do jogo e as duas listas de variação", () => {
    render(<RoundHighlights highlights={highlights()} />);

    expect(screen.getByText("Boaster")).toBeInTheDocument();
    expect(screen.getByText("24.6")).toBeInTheDocument();
    expect(screen.getByText("Maiores Valorizações")).toBeInTheDocument();
    expect(screen.getByText("+7.5")).toBeInTheDocument();
    expect(screen.getByText("Maiores Desvalorizações")).toBeInTheDocument();
    expect(screen.getByText("−3.0")).toBeInTheDocument();
  });

  it("mantém o título da seção, com o número da rodada, quando há conteúdo", () => {
    render(<RoundHighlights highlights={highlights()} />);

    expect(screen.getByText("Destaques da rodada 7")).toBeInTheDocument();
  });

  it("rodada fechada não se anuncia como parcial", () => {
    render(<RoundHighlights highlights={highlights()} />);

    expect(screen.queryByText("Parcial")).not.toBeInTheDocument();
  });

  it("rodada em andamento avisa que os números ainda vão mudar", () => {
    render(<RoundHighlights highlights={highlights({ partial: true })} />);

    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(
      screen.getByText(/atualiza conforme as partidas da rodada terminam/),
    ).toBeInTheDocument();
  });
});
