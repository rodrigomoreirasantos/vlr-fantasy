import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketSummaryBar } from "@/components/market/market-summary-bar";
import type { Player } from "@/lib/team/types";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "derke",
    nickname: "Derke",
    team: "FNATIC",
    agent: "Raze",
    role: "Duelista",
    score: 15.8,
    priceCents: 4000,
    active: true,
    availability: "available",
    availabilityNote: null,
    region: "emea",
    ...overrides,
  };
}

const CLOSES_AT = new Date("2026-03-14T18:00:00Z");

describe("MarketSummaryBar", () => {
  it("mercado aberto com fechamento: mostra o countdown sob 'Fecha em'", () => {
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={null}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("Fecha em")).toBeInTheDocument();
    expect(screen.getByText("7h 0m")).toBeInTheDocument();
  });

  it("mercado aberto sem closesAt (nenhum jogo marcado): mostra a frase sob 'Mercado'", () => {
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={null}
        marketOpen
        closesIn="Nenhum jogo marcado"
        closesAt={null}
      />,
    );

    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("Nenhum jogo marcado")).toBeInTheDocument();
  });

  it("mercado fechado: mostra 'Fechado', mesmo com closesAt presente", () => {
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={null}
        marketOpen={false}
        closesIn="Encerrado"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("Fechado")).toBeInTheDocument();
  });

  it("substituição: mostra o teto de compra (saldo + preço de quem sai) e o nickname", () => {
    const outgoing = makePlayer();
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={outgoing}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("Pode gastar")).toBeInTheDocument();
    // 10.000 + 4.000 centavos = 140.0 créditos.
    expect(screen.getByText("140.0")).toBeInTheDocument();
    expect(screen.getByText(/com Derke/)).toBeInTheDocument();
  });

  it("vaga vazia: não mostra a célula do meio — o teto seria igual ao saldo", () => {
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={null}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.queryByText("Pode gastar")).not.toBeInTheDocument();
    // Saldo aparece uma única vez — sem repetir o mesmo número na célula do meio.
    expect(screen.getAllByText("100.0")).toHaveLength(1);
  });
});
