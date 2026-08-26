import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  MarketSheet,
  type MarketSelection,
} from "@/components/market/market-sheet";
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

const outgoing = makePlayer({
  id: "derke",
  nickname: "Derke",
  priceCents: 4000,
});
const substituting: MarketSelection = { position: 1, outgoing };
const emptySlot: MarketSelection = { position: 3, outgoing: null };

function emptyMarket(): Record<PlayerRole, Player[]> {
  return { Duelista: [], Iniciador: [], Controlador: [], Sentinela: [] };
}

describe("MarketSheet — substituição (vaga ocupada)", () => {
  it("lista só candidatos da mesma função de quem sai", () => {
    const market = emptyMarket();
    market.Duelista = [makePlayer({ id: "yay", nickname: "yay" })];
    market.Sentinela = [
      makePlayer({ id: "chronicle", nickname: "Chronicle", role: "Sentinela" }),
    ];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
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
        selection={substituting}
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
        selection={substituting}
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

  it("não mostra cabeçalho de função (só um grupo)", () => {
    const market = emptyMarket();
    market.Duelista = [makePlayer({ id: "yay", nickname: "yay" })];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={market}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "Duelista" }),
    ).not.toBeInTheDocument();
  });

  it("mercado fechado: mostra o alerta e nenhuma linha fica acionável", () => {
    const market = emptyMarket();
    market.Duelista = [
      makePlayer({ id: "yay", nickname: "yay", priceCents: 1 }),
    ];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
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

  it("lista antes quem pode ser contratado, depois quem está bloqueado", () => {
    const market = emptyMarket();
    // Ordem de entrada deliberadamente "errada": o caro (bloqueado) vem
    // primeiro no array, os dois acessíveis depois.
    market.Duelista = [
      makePlayer({ id: "caro", nickname: "Caro", priceCents: 1_000_000 }),
      makePlayer({ id: "barato-a", nickname: "BaratoA", priceCents: 1000 }),
      makePlayer({ id: "barato-b", nickname: "BaratoB", priceCents: 2000 }),
    ];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={market}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    const names = screen
      .getAllByRole("listitem")
      .map(
        (item) =>
          within(item).getByText(/^(Caro|BaratoA|BaratoB)$/).textContent,
      );

    expect(names).toEqual(["BaratoA", "BaratoB", "Caro"]);
  });
});

describe("MarketSheet — nova contratação (vaga vazia)", () => {
  it("mostra o título e a descrição com a vaga, sem função", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={emptySlot}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Mercado · Nova contratação")).toBeInTheDocument();
    expect(
      screen.getByText("Escolha um jogador para a vaga 3."),
    ).toBeInTheDocument();
  });

  it("lista candidatos das quatro funções, cada uma com cabeçalho", () => {
    const market = emptyMarket();
    market.Duelista = [makePlayer({ id: "yay", nickname: "yay" })];
    market.Sentinela = [
      makePlayer({ id: "chronicle", nickname: "Chronicle", role: "Sentinela" }),
    ];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={emptySlot}
        market={market}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Duelista" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sentinela" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Iniciador" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("yay")).toBeInTheDocument();
    expect(screen.getByText("Chronicle")).toBeInTheDocument();
  });

  it("mostra o estado vazio genérico quando não há candidato algum", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={emptySlot}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Nenhum jogador disponível no mercado."),
    ).toBeInTheDocument();
  });

  it("o custo do candidato é o preço cheio (sem crédito de venda)", () => {
    const market = emptyMarket();
    market.Duelista = [
      makePlayer({ id: "yay", nickname: "yay", priceCents: 5000 }),
    ];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={emptySlot}
        market={market}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText(/\+50\.0 · saldo 50\.0/)).toBeInTheDocument();
  });
});
