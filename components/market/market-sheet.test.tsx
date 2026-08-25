import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketSheet } from "@/components/market/market-sheet";
import type { Player, PlayerRole } from "@/lib/team/types";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "tenz",
    nickname: "TenZ",
    team: "SENTINELS",
    agent: "Jett",
    role: "Duelista",
    score: 18.2,
    priceCents: 5000,
    active: true,
    ...overrides,
  };
}

const outgoing = makePlayer({ id: "derke", nickname: "Derke", priceCents: 4000 });

function emptyMarket(): Record<PlayerRole, Player[]> {
  return { Duelista: [], Iniciador: [], Controlador: [], Sentinela: [] };
}

describe("MarketSheet", () => {
  it("lista só candidatos da mesma função de quem sai", () => {
    const market = emptyMarket();
    market.Duelista = [makePlayer({ id: "yay", nickname: "yay" })];
    market.Sentinela = [makePlayer({ id: "chronicle", nickname: "Chronicle", role: "Sentinela" })];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        outgoing={outgoing}
        market={market}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("yay")).toBeInTheDocument();
    expect(screen.queryByText("Chronicle")).not.toBeInTheDocument();
  });

  it("mostra o título e a descrição com a função e o jogador que sai", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        outgoing={outgoing}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Mercado · Duelista")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Substituindo Derke. Só aparecem jogadores da mesma função.",
      ),
    ).toBeInTheDocument();
  });

  it("mostra o estado vazio quando não há candidatos", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        outgoing={outgoing}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Nenhum Duelista disponível no mercado."),
    ).toBeInTheDocument();
  });

  it("mercado fechado: mostra o alerta e nenhuma linha fica acionável", () => {
    const market = emptyMarket();
    market.Duelista = [makePlayer({ id: "yay", nickname: "yay", priceCents: 1 })];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        outgoing={outgoing}
        market={market}
        balanceCents={10_000}
        marketOpen={false}
        closesIn="Encerrado"
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      within(screen.getByRole("alert")).getByText("Mercado fechado"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /contratar yay/i }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
