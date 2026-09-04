import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  executeSubstituteMock,
  executeSetCaptainMock,
  executeSellMock,
  substitutePlayerToken,
  setCaptainToken,
  sellPlayerToken,
} = vi.hoisted(() => ({
  executeSubstituteMock: vi.fn(),
  executeSetCaptainMock: vi.fn(),
  executeSellMock: vi.fn(),
  substitutePlayerToken: Symbol("substitutePlayer"),
  setCaptainToken: Symbol("setCaptain"),
  sellPlayerToken: Symbol("sellPlayer"),
}));

vi.mock("@/app/(app)/my-team/actions", () => ({
  substitutePlayer: substitutePlayerToken,
  setCaptain: setCaptainToken,
  sellPlayer: sellPlayerToken,
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: (action: unknown) => {
    if (action === setCaptainToken)
      return { execute: executeSetCaptainMock, isExecuting: false };
    if (action === sellPlayerToken)
      return { execute: executeSellMock, isExecuting: false };
    return { execute: executeSubstituteMock, isExecuting: false };
  },
}));
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
    availability: "available",
    availabilityNote: null,
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
  beforeEach(() => {
    executeSubstituteMock.mockClear();
    executeSetCaptainMock.mockClear();
    executeSellMock.mockClear();
  });

  it("clicar na linha da lista abre o mercado para aquela vaga", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(screen.getByRole("button", { name: /substituir tenz$/i }));

    expect(screen.getByText("Mercado · Substituir TenZ")).toBeInTheDocument();
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
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Substituir TenZ no campo" }),
    );

    expect(screen.getByText("Mercado · Substituir TenZ")).toBeInTheDocument();
    expect(screen.getByText(/Substituindo TenZ\./)).toBeInTheDocument();
  });

  it("mercado fechado: nem a lista, nem o campo, nem a braçadeira ficam clicáveis", () => {
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen={false}
        lockedTeams={[]}
        closesIn="Encerrado"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /substituir/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /capitão/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /vender/i }),
    ).not.toBeInTheDocument();
    // O selo de quem já é capitão continua visível (na lista e no campo),
    // só não é mais um botão.
    expect(screen.getAllByLabelText("Capitão")).toHaveLength(2);
  });

  it("clicar na braçadeira de outro jogador, na lista, torna-o capitão", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Tornar TenZ capitão" }),
    );

    expect(executeSetCaptainMock).toHaveBeenCalledWith({ slotId: "slot-2" });
  });

  it("clicar na braçadeira de quem já é capitão não dispara a action de novo", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Boaster é o capitão" }),
    );

    expect(executeSetCaptainMock).not.toHaveBeenCalled();
  });

  it("clicar na braçadeira do marcador no campo também torna o jogador capitão", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Tornar TenZ capitão no campo" }),
    );

    expect(executeSetCaptainMock).toHaveBeenCalledWith({ slotId: "slot-2" });
  });

  it("clicar em Vender no Sheet chama a action de venda para a vaga selecionada", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(screen.getByRole("button", { name: /substituir tenz$/i }));
    await user.click(screen.getByRole("button", { name: /vender tenz/i }));

    expect(executeSellMock).toHaveBeenCalledWith({
      slotId: "slot-2",
      outgoingPlayerId: "tenz",
    });
  });

  it("clicar em Vender na linha do Resumo vende direto, sem abrir o mercado", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Vender TenZ" }));

    expect(executeSellMock).toHaveBeenCalledWith({
      slotId: "slot-2",
      outgoingPlayerId: "tenz",
    });
    // Vender na linha não abre o Sheet.
    expect(screen.queryByText(/Mercado ·/)).not.toBeInTheDocument();
  });

  it("vaga travada pela regra do dia: só ela sai de circulação", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={["FNATIC"]}
        closesIn="2h 0m"
      />,
    );

    // Boaster é do FNATIC, que joga hoje: a linha dele sai de circulação.
    expect(
      screen.queryByRole("button", { name: /substituir boaster$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /vender boaster$/i }),
    ).not.toBeInTheDocument();

    // TenZ é de outro campeonato e continua negociável.
    await user.click(screen.getByRole("button", { name: /substituir tenz$/i }));
    expect(screen.getByText(/Mercado ·/)).toBeInTheDocument();
  });

  it("mercado fechado: o botão Vender da linha não aparece", () => {
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen={false}
        lockedTeams={[]}
        closesIn="Encerrado"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Vender TenZ" }),
    ).not.toBeInTheDocument();
  });
});

describe("RosterPanel — vaga vazia", () => {
  beforeEach(() => {
    executeSubstituteMock.mockClear();
    executeSetCaptainMock.mockClear();
    executeSellMock.mockClear();
  });

  it("mostra a faixa de progresso quando a escalação não está completa", () => {
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    expect(
      screen.getByText("Monte seu time · 2 de 5 jogadores escalados"),
    ).toBeInTheDocument();
  });

  it("com a escalação completa, a faixa de progresso não aparece", () => {
    const roster = makeRoster().map((slot) =>
      slot.player ? slot : { ...slot, player: makePlayer({ id: slot.id! }) },
    );

    render(
      <RosterPanel
        roster={roster}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    expect(screen.queryByText(/jogadores escalados/)).not.toBeInTheDocument();
  });

  it("clicar no card + da lista abre o mercado em modo nova contratação", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Adicionar jogador na vaga 3" }),
    );

    expect(screen.getByText("Mercado · Nova contratação")).toBeInTheDocument();
    expect(
      screen.getByText("Escolha um jogador para a vaga 3."),
    ).toBeInTheDocument();
  });

  it("clicar no marcador vazio do campo abre o mesmo mercado, para a mesma vaga", async () => {
    const user = userEvent.setup();
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Adicionar jogador na vaga 3 no campo",
      }),
    );

    expect(screen.getByText("Mercado · Nova contratação")).toBeInTheDocument();
  });

  it("confirmar a contratação chama a action com outgoingPlayerId nulo", async () => {
    const user = userEvent.setup();
    const market = emptyMarket();
    market.Duelista = [makePlayer({ id: "yay", nickname: "yay" })];

    render(
      <RosterPanel
        roster={makeRoster()}
        market={market}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        closesIn="36h 12m"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Adicionar jogador na vaga 3" }),
    );
    await user.click(screen.getByRole("button", { name: /contratar yay/i }));

    expect(executeSubstituteMock).toHaveBeenCalledWith({
      slotId: "slot-3",
      outgoingPlayerId: null,
      incomingPlayerId: "yay",
    });
  });

  it("mercado fechado: o card + fica inerte", () => {
    render(
      <RosterPanel
        roster={makeRoster()}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen={false}
        lockedTeams={[]}
        closesIn="Encerrado"
      />,
    );

    expect(
      screen.queryByRole("button", { name: /adicionar jogador/i }),
    ).not.toBeInTheDocument();
  });
});
