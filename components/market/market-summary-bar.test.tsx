import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketSummaryBar } from "@/components/market/market-summary-bar";
import { regionColor } from "@/lib/round/regions";
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
    photoUrl: null,
    ...overrides,
  };
}

const CLOSES_AT = new Date("2026-03-14T18:00:00Z");

describe("MarketSummaryBar", () => {
  it("mostra sempre a região do time, na cor da região", () => {
    render(
      <MarketSummaryBar
        region="americas"
        balanceCents={10_000}
        outgoing={null}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("Região")).toBeInTheDocument();
    expect(screen.getByText("Americas")).toHaveStyle({
      color: regionColor("americas"),
    });
  });

  it("time Internacional: mostra 'Internacional', mesmo sem região no escopo do mercado", () => {
    render(
      <MarketSummaryBar
        region="international"
        balanceCents={10_000}
        outgoing={null}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("Internacional")).toHaveStyle({
      color: regionColor("international"),
    });
  });

  it("mercado aberto com fechamento: mostra o countdown sob 'Fecha em'", () => {
    render(
      <MarketSummaryBar
        region="americas"
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

  it("mercado aberto sem closesAt (nenhum jogo marcado): a região continua na célula", () => {
    render(
      <MarketSummaryBar
        region="americas"
        balanceCents={10_000}
        outgoing={null}
        marketOpen
        closesIn="Nenhum jogo marcado"
        closesAt={null}
      />,
    );

    expect(screen.getByText("Região")).toBeInTheDocument();
    expect(screen.getByText("Nenhum jogo marcado")).toBeInTheDocument();
  });

  it("mercado fechado: mostra 'Mercado fechado' na sublinha, sem afirmar que a região fechou", () => {
    render(
      <MarketSummaryBar
        region="china"
        balanceCents={10_000}
        outgoing={null}
        marketOpen={false}
        closesIn="Encerrado"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("China")).toBeInTheDocument();
    expect(screen.getByText("Mercado fechado")).toBeInTheDocument();
  });

  it("substituição: mostra o teto de compra (saldo + preço de quem sai) e o nickname", () => {
    const outgoing = makePlayer();
    render(
      <MarketSummaryBar
        region="americas"
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

  it("substituição: mostra a foto de quem sai, quando ele tem uma (plano 18)", () => {
    const { container } = render(
      <MarketSummaryBar
        region="americas"
        balanceCents={10_000}
        outgoing={makePlayer({ photoUrl: "https://owcdn.net/img/x.png" })}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("vaga vazia: só duas células — a segunda continua sendo a região", () => {
    render(
      <MarketSummaryBar
        region="americas"
        balanceCents={10_000}
        outgoing={null}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.queryByText("Pode gastar")).not.toBeInTheDocument();
    expect(screen.getByText("Região")).toBeInTheDocument();
    // Saldo aparece uma única vez — sem repetir o mesmo número na célula do meio.
    expect(screen.getAllByText("100.0")).toHaveLength(1);
  });
});
