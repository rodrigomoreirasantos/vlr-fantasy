import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PriceMoverList } from "@/components/home/price-mover-list";
import type { PriceMover } from "@/lib/round/types";

function mover(overrides: Partial<PriceMover> = {}): PriceMover {
  return {
    playerId: "tenz",
    nickname: "TenZ",
    team: "SENTINELS",
    role: "Duelista",
    priceDeltaCents: 750,
    ...overrides,
  };
}

describe("PriceMoverList", () => {
  it("estado vazio", () => {
    render(
      <PriceMoverList
        title="Maiores Valorizações"
        movers={[]}
        tone="positive"
      />,
    );

    expect(
      screen.getByText("Nenhum jogador se destacou nesta rodada."),
    ).toBeInTheDocument();
  });

  it("sinal '+' nas altas", () => {
    render(
      <PriceMoverList
        title="Maiores Valorizações"
        movers={[mover({ priceDeltaCents: 750 })]}
        tone="positive"
      />,
    );

    expect(screen.getByText("TenZ")).toBeInTheDocument();
    expect(screen.getByText("+7.5")).toBeInTheDocument();
  });

  it("sinal '−' nas quedas", () => {
    render(
      <PriceMoverList
        title="Maiores Desvalorizações"
        movers={[mover({ priceDeltaCents: -300 })]}
        tone="negative"
      />,
    );

    expect(screen.getByText("−3.0")).toBeInTheDocument();
  });
});
