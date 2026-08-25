import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const executeMock = vi.fn();

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("@/app/my-team/actions", () => ({ substitutePlayer: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RosterPanel } from "@/components/team/roster-panel";
import type { Player, PlayerRole, RosterSlot } from "@/lib/team/types";

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

function makeRoster(): RosterSlot[] {
  return [
    {
      id: "slot-1",
      captain: true,
      player: makePlayer({
        id: "boaster",
        nickname: "Boaster",
        role: "Controlador",
        agent: "Astra",
        team: "FNATIC",
      }),
    },
    { id: "slot-2", captain: false, player: makePlayer() },
    { id: "slot-3", captain: false, player: null },
    { id: "slot-4", captain: false, player: null },
    { id: "slot-5", captain: false, player: null },
  ];
}

function emptyMarket(): Record<PlayerRole, Player[]> {
  return { Duelista: [], Iniciador: [], Controlador: [], Sentinela: [] };
}

describe("RosterPanel", () => {
  it("clicar na linha da lista abre o mercado para aquela vaga", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
      />,
    );

    await user.click(screen.getByRole("button", { name: /substituir tenz$/i }));

    expect(screen.getByText("Mercado · Duelista")).toBeInTheDocument();
    expect(screen.getByText(/Substituindo TenZ\./)).toBeInTheDocument();
  });

  it("clicar no marcador do campo abre o mesmo mercado, para o mesmo jogador", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        closesIn="36h 12m"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Substituir TenZ no campo" }),
    );

    expect(screen.getByText("Mercado · Duelista")).toBeInTheDocument();
    expect(screen.getByText(/Substituindo TenZ\./)).toBeInTheDocument();
  });

  it("mercado fechado: nem a lista nem o campo ficam clicáveis", () => {
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen={false}
        closesIn="Encerrado"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /substituir/i }),
    ).not.toBeInTheDocument();
  });
});
