import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    availability: "available",
    availabilityNote: null,
    region: "americas",
    ...overrides,
  };
}

const AMERICAS_SCOPE = { kind: "region" as const, region: "americas" as const };

/** Um fechamento qualquer — os testes não avançam o relógio, então o texto exibido é sempre `closesIn`. */
const CLOSES_AT = new Date("2026-03-14T18:00:00Z");

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
  it("mostra o título e a descrição com quem sai, sem restrição de função", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Mercado · Substituir Derke")).toBeInTheDocument();
    expect(
      screen.getByText("Substituindo Derke. Escolha qualquer função."),
    ).toBeInTheDocument();
  });

  it("abre na aba da função de quem sai, mas qualquer outra função é contratável", async () => {
    const user = userEvent.setup();
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    // Derke é Duelista: a aba inicial é Duelista, e só yay aparece.
    expect(screen.getByRole("tab", { name: "Duelista" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("yay")).toBeInTheDocument();
    expect(screen.queryByText("Chronicle")).not.toBeInTheDocument();

    // Trocar de aba dá acesso a Chronicle — a substituição não é mais
    // restrita à função de quem sai.
    await user.click(screen.getByRole("tab", { name: "Sentinela" }));

    expect(screen.getByText("Chronicle")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /contratar chronicle/i }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("mostra o estado vazio da aba quando a função ativa não tem candidatos", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Nenhum Duelista disponível no mercado."),
    ).toBeInTheDocument();
  });

  it("as quatro abas de função aparecem, mesmo numa substituição", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Duelista" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Iniciador" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Controlador" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sentinela" })).toBeInTheDocument();
  });

  it("função sem candidatos: a aba fica desabilitada", () => {
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Duelista" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Iniciador" })).toBeDisabled();
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="Encerrado"
        closesAt={null}
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

  it("lista antes quem pode ser contratado, depois quem está bloqueado (do mais caro para o mais barato)", () => {
    const market = emptyMarket();
    // Ordem de entrada deliberadamente "errada": o caro (bloqueado) vem
    // primeiro no array, os dois acessíveis depois. Teto de compra é
    // 10.000 + 4.000 (preço de Derke, quem sai) = 14.000: Caro (1.000.000)
    // fica "insufficient-balance", os outros dois passam.
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
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

    expect(names).toEqual(["BaratoB", "BaratoA", "Caro"]);
  });

  it("o toggle de ordenação alterna entre preço decrescente, crescente e alfabética", async () => {
    const user = userEvent.setup();
    const market = emptyMarket();
    // Três preços e três nicknames cujas ordens não coincidem em nenhum par,
    // para cada clique provar uma permutação diferente.
    market.Duelista = [
      makePlayer({ id: "alfa", nickname: "Alfa", priceCents: 2000 }),
      makePlayer({ id: "bravo", nickname: "Bravo", priceCents: 3000 }),
      makePlayer({ id: "charlie", nickname: "Charlie", priceCents: 1000 }),
    ];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={market}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    const namesOf = (regex: RegExp) =>
      screen
        .getAllByRole("listitem")
        .map((item) => within(item).getByText(regex).textContent);

    const NAME_RE = /^(Alfa|Bravo|Charlie)$/;

    // Padrão: preço decrescente.
    expect(namesOf(NAME_RE)).toEqual(["Bravo", "Alfa", "Charlie"]);

    await user.click(
      screen.getByRole("radio", {
        name: "Preço: do mais barato para o mais caro",
      }),
    );
    expect(namesOf(NAME_RE)).toEqual(["Charlie", "Alfa", "Bravo"]);

    await user.click(
      screen.getByRole("radio", { name: "A-Z: ordem alfabética" }),
    );
    expect(namesOf(NAME_RE)).toEqual(["Alfa", "Bravo", "Charlie"]);
  });

  it("não mostra os controles de busca e ordenação enquanto o mercado ainda carrega", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={null}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={null}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("radio", { name: "A-Z: ordem alfabética" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("jogador de organização travada some da lista; um bloqueado por saldo continua visível", () => {
    const market = emptyMarket();
    market.Duelista = [
      makePlayer({ id: "travado", nickname: "Travado", team: "FNATIC" }),
      makePlayer({
        id: "caro",
        nickname: "MuitoCaro",
        priceCents: 1_000_000,
      }),
    ];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={market}
        balanceCents={10_000}
        marketOpen
        lockedTeams={["FNATIC"]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByText("Travado")).not.toBeInTheDocument();
    expect(screen.getByText("MuitoCaro")).toBeInTheDocument();
    expect(
      screen.getByText("Saldo insuficiente para esta contratação."),
    ).toBeInTheDocument();
  });

  it("organização de quem sai travada: mostra o alerta dedicado, lista continua inteira e bloqueada", () => {
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
        // Derke (quem sai) é de SENTINELS por padrão do fixture `outgoing`.
        lockedTeams={["SENTINELS"]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Organização travada hoje")).toBeInTheDocument();
    // Ninguém some: yay continua na lista, bloqueado.
    expect(screen.getByText("yay")).toBeInTheDocument();
    expect(
      screen.getByText("O mercado deste campeonato já fechou — ele joga hoje."),
    ).toBeInTheDocument();
  });
});

describe("MarketSheet — busca por nome", () => {
  it("filtra as quatro funções conforme o usuário digita", async () => {
    const user = userEvent.setup();
    const market = emptyMarket();
    market.Duelista = [
      makePlayer({ id: "yay", nickname: "yay" }),
      makePlayer({ id: "derps", nickname: "Derps" }),
    ];
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    const searchbox = screen.getByRole("searchbox", {
      name: /buscar jogador pelo nome/i,
    });
    await user.type(searchbox, "der");

    expect(screen.getByText("Derps")).toBeInTheDocument();
    expect(screen.queryByText("yay")).not.toBeInTheDocument();
  });

  it("o contador só aparece com busca ativa e reflete as quatro funções", async () => {
    const user = userEvent.setup();
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    // Sem busca: nome puro da função, sem número ao lado.
    expect(screen.getByRole("tab", { name: "Duelista" })).toBeInTheDocument();

    await user.type(
      screen.getByRole("searchbox", { name: /buscar jogador pelo nome/i }),
      "chronicle",
    );

    // Duelista (aba ativa) fica sem resultado, mas segue HABILITADA — o
    // contador "0" é a informação, não um motivo para travar a aba.
    const duelistaTab = screen.getByRole("tab", { name: /^Duelista/ });
    expect(duelistaTab).toHaveTextContent("0");
    expect(duelistaTab).toBeEnabled();

    expect(screen.getByRole("tab", { name: /^Sentinela/ })).toHaveTextContent(
      "1",
    );
  });

  it("busca sem resultado numa função: mostra o termo e o botão Limpar busca", async () => {
    const user = userEvent.setup();
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    await user.type(
      screen.getByRole("searchbox", { name: /buscar jogador pelo nome/i }),
      "zzz",
    );

    expect(
      screen.getByText(/Nenhum Duelista corresponde a "zzz"/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpar busca" }));

    expect(screen.getByText("yay")).toBeInTheDocument();
  });

  it("função sem candidato nenhum no mercado: mensagem distinta da de busca sem resultado", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Nenhum Duelista disponível no mercado."),
    ).toBeInTheDocument();
  });

  it("função com candidatos, todos travados por organização: mensagem de mercado fechado", () => {
    const market = emptyMarket();
    market.Duelista = [
      makePlayer({ id: "travado", nickname: "Travado", team: "FNATIC" }),
    ];

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={market}
        balanceCents={10_000}
        marketOpen
        lockedTeams={["FNATIC"]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Nenhum Duelista com mercado aberto agora."),
    ).toBeInTheDocument();
  });

  it("trocar de vaga sem fechar o Sheet zera a busca e a ordem", async () => {
    // O RosterPanel mantém o Sheet sempre montado, só alternando `open` —
    // trocar de `selection` (nova vaga) sem desmontar é o cenário real; sem
    // reset, uma busca esquecida faria a próxima vaga parecer vazia.
    const user = userEvent.setup();
    const market = emptyMarket();
    market.Duelista = [makePlayer({ id: "yay", nickname: "yay" })];
    const otherSlot: MarketSelection = {
      position: 2,
      outgoing: makePlayer({ id: "chamber", nickname: "Chamber" }),
    };

    const { rerender } = render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={market}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    await user.type(
      screen.getByRole("searchbox", { name: /buscar jogador pelo nome/i }),
      "zzz",
    );
    expect(screen.queryByText("yay")).not.toBeInTheDocument();

    rerender(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={otherSlot}
        market={market}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke", "chamber"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("searchbox", { name: /buscar jogador pelo nome/i }),
    ).toHaveValue("");
    expect(screen.getByText("yay")).toBeInTheDocument();
  });

  it("anuncia a contagem de resultados numa live region", async () => {
    const user = userEvent.setup();
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("");

    await user.type(
      screen.getByRole("searchbox", { name: /buscar jogador pelo nome/i }),
      "yay",
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      '1 jogador encontrado para "yay".',
    );
  });
});

describe("MarketSheet — vender sem substituir", () => {
  it("mostra o crédito da venda e chama onSell ao clicar", async () => {
    const user = userEvent.setup();
    const onSell = vi.fn();

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
        onSell={onSell}
      />,
    );

    expect(screen.getByText("Você recebe +40.0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /vender derke/i }));
    expect(onSell).toHaveBeenCalledWith(outgoing);
  });

  it("mercado fechado: o botão de vender fica desabilitado", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen={false}
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="Encerrado"
        closesAt={null}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
        onSell={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /vender derke/i }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("vaga vazia: não mostra o botão de vender", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={emptySlot}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
        onSell={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /vender/i }),
    ).not.toBeInTheDocument();
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Mercado · Nova contratação")).toBeInTheDocument();
    expect(
      screen.getByText("Escolha um jogador para a vaga 3."),
    ).toBeInTheDocument();
  });

  it("abre na primeira função com candidatos; as outras ficam a uma aba de distância", async () => {
    const user = userEvent.setup();
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Duelista" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Iniciador" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Controlador" })).toBeDisabled();
    expect(screen.getByText("yay")).toBeInTheDocument();
    expect(screen.queryByText("Chronicle")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Sentinela" }));
    expect(screen.getByText("Chronicle")).toBeInTheDocument();
  });

  it("mostra o estado vazio da aba quando não há candidato algum", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={emptySlot}
        market={emptyMarket()}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Nenhum Duelista disponível no mercado."),
    ).toBeInTheDocument();
  });

  it("o card mostra o preço atual do candidato — sem custo líquido nem saldo projetado", () => {
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
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("50.0")).toBeInTheDocument();
    expect(within(panel).queryByText(/saldo/i)).not.toBeInTheDocument();
  });
});

describe("MarketSheet — carregando (loadMarket ainda não voltou)", () => {
  it("market nulo: mostra o skeleton da lista, com o resumo já preenchido", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={null}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={null}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    // Cabeçalho e resumo já vêm do dado de página — não dependem do mercado.
    expect(screen.getByText("Mercado · Substituir Derke")).toBeInTheDocument();
    expect(screen.getByText("36h 12m")).toBeInTheDocument();

    // A lista, sim, está esperando o mercado.
    expect(screen.getByText("Carregando o mercado…")).toBeInTheDocument();
    const loading = screen.getByText("Carregando o mercado…").parentElement;
    expect(loading).toHaveAttribute("aria-busy", "true");
  });

  it("market nulo: as quatro abas ficam desabilitadas", () => {
    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={null}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={null}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    for (const role of ["Duelista", "Iniciador", "Controlador", "Sentinela"]) {
      expect(screen.getByRole("tab", { name: role })).toBeDisabled();
    }
  });

  it("venda continua disponível mesmo com o mercado ainda carregando", async () => {
    const user = userEvent.setup();
    const onSell = vi.fn();

    render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={null}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={null}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
        onSell={onSell}
      />,
    );

    await user.click(screen.getByRole("button", { name: /vender derke/i }));
    expect(onSell).toHaveBeenCalledWith(outgoing);
  });

  it("vaga vazia: ao chegar o mercado, abre na primeira função COM candidatos", () => {
    // Regressão: o Sheet abre sem catálogo, então `initialRole` cai no
    // fallback `PLAYER_ROLES[0]` ("Duelista"). Sem remontar o `Tabs` quando o
    // mercado chega, a vaga ficaria presa numa aba vazia e desabilitada
    // enquanto Sentinela tem gente.
    const market = emptyMarket();
    market.Sentinela = [
      makePlayer({ id: "chronicle", nickname: "Chronicle", role: "Sentinela" }),
    ];

    const { rerender } = render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={emptySlot}
        market={null}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={null}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    rerender(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={emptySlot}
        market={market}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={[]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Sentinela" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Chronicle")).toBeInTheDocument();
  });

  it("quando o mercado chega, a lista substitui o skeleton", () => {
    const market = emptyMarket();
    market.Duelista = [makePlayer({ id: "yay", nickname: "yay" })];

    const { rerender } = render(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={null}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={null}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Carregando o mercado…")).toBeInTheDocument();

    rerender(
      <MarketSheet
        open
        onOpenChange={vi.fn()}
        selection={substituting}
        market={market}
        balanceCents={10_000}
        marketOpen
        lockedTeams={[]}
        scope={AMERICAS_SCOPE}
        closesIn="36h 12m"
        closesAt={CLOSES_AT}
        rosteredPlayerIds={["derke"]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByText("Carregando o mercado…")).not.toBeInTheDocument();
    expect(screen.getByText("yay")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Duelista" })).toBeEnabled();
  });
});
