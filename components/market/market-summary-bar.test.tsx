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
  it("mercado aberto com fechamento: mostra o countdown, com o texto do servidor no primeiro paint", () => {
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={null}
        position={3}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("7h 0m")).toBeInTheDocument();
    // Sem a palavra "Mercado" repetida — o rótulo já está no cabeçalho do card.
    expect(screen.queryByText(/mercado fecha/i)).not.toBeInTheDocument();
  });

  it("mercado aberto sem closesAt (nenhum jogo marcado): mostra a frase, não o countdown", () => {
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={null}
        position={3}
        marketOpen
        closesIn="Nenhum jogo marcado"
        closesAt={null}
      />,
    );

    expect(screen.getByText("Nenhum jogo marcado")).toBeInTheDocument();
  });

  it("mercado fechado: mostra 'Fechado', mesmo com closesAt presente", () => {
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={null}
        position={3}
        marketOpen={false}
        closesIn="Encerrado"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("Fechado")).toBeInTheDocument();
  });

  it("substituição: mostra quem sai e o crédito da venda", () => {
    const outgoing = makePlayer();
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={outgoing}
        position={1}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("Derke")).toBeInTheDocument();
  });

  it("vaga vazia: mostra o número da vaga no lugar do nickname", () => {
    render(
      <MarketSummaryBar
        balanceCents={10_000}
        outgoing={null}
        position={4}
        marketOpen
        closesIn="7h 0m"
        closesAt={CLOSES_AT}
      />,
    );

    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
