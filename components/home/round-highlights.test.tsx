import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RoundHighlights } from "@/components/home/round-highlights";
import type { RoundHighlights as RoundHighlightsData } from "@/lib/home/types";

function highlights(
  overrides: Partial<RoundHighlightsData> = {},
): RoundHighlightsData {
  return {
    partial: false,
    pending: [],
    scorers: [
      {
        playerId: "boaster",
        nickname: "Boaster",
        team: "FNATIC",
        role: "Controlador",
        points: 24.6,
        region: "emea",
        photoUrl: null,
      },
      {
        playerId: "aspas",
        nickname: "aspas",
        team: "LEVIATÁN",
        role: "Duelista",
        points: 19.2,
        region: "americas",
        photoUrl: null,
      },
    ],
    movers: [
      {
        playerId: "tenz",
        nickname: "TenZ",
        team: "SENTINELS",
        role: "Duelista",
        priceDeltaCents: 750,
        region: "americas",
        photoUrl: null,
      },
      {
        playerId: "sacy",
        nickname: "Sacy",
        team: "LOUD",
        role: "Iniciador",
        priceDeltaCents: -300,
        region: "americas",
        photoUrl: null,
      },
      {
        playerId: "derke",
        nickname: "Derke",
        team: "FNATIC",
        role: "Duelista",
        priceDeltaCents: 400,
        region: "emea",
        photoUrl: null,
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

  it("o título não carrega o número da rodada", () => {
    render(<RoundHighlights highlights={highlights()} />);

    expect(screen.getByText("Destaques da rodada")).toBeInTheDocument();
    expect(
      screen.queryByText(/Destaques da rodada \d/),
    ).not.toBeInTheDocument();
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

  it("oferece um chip por região revelada, mais 'Todos'", () => {
    render(<RoundHighlights highlights={highlights()} />);

    const filters = screen.getByRole("group", { name: "Filtrar por região" });
    expect(
      within(filters)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Todos", "Americas", "EMEA"]);
  });

  it("escolher uma região recorta os destaques para ela", async () => {
    const user = userEvent.setup();
    render(<RoundHighlights highlights={highlights()} />);

    await user.click(screen.getByRole("button", { name: "Americas" }));

    // O maior pontuador de Americas, não o do circuito.
    expect(screen.getByText("aspas")).toBeInTheDocument();
    expect(screen.queryByText("Boaster")).not.toBeInTheDocument();
    // E as variações também: Derke é de EMEA.
    expect(screen.getByText("TenZ")).toBeInTheDocument();
    expect(screen.queryByText("Derke")).not.toBeInTheDocument();
  });

  it("'Todos' volta a agregar o circuito inteiro", async () => {
    const user = userEvent.setup();
    render(<RoundHighlights highlights={highlights()} />);

    await user.click(screen.getByRole("button", { name: "Americas" }));
    await user.click(screen.getByRole("button", { name: "Todos" }));

    expect(screen.getByText("Boaster")).toBeInTheDocument();
    expect(screen.getByText("Derke")).toBeInTheDocument();
  });

  it("uma região só não merece filtro", () => {
    render(
      <RoundHighlights
        highlights={highlights({
          scorers: [
            {
              playerId: "boaster",
              nickname: "Boaster",
              team: "FNATIC",
              role: "Controlador",
              points: 24.6,
              region: "emea",
              photoUrl: null,
            },
          ],
        })}
      />,
    );

    expect(
      screen.queryByRole("group", { name: "Filtrar por região" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Boaster")).toBeInTheDocument();
  });

  it("liga fora do calendário desta semana continua mostrando destaques", () => {
    // A inversão do portão: nada pendente ⇒ tudo revelado, mesmo que a região
    // não apareça na janela de partidas que alimenta `pendingRegions`.
    render(<RoundHighlights highlights={highlights({ pending: [] })} />);

    expect(screen.getByText("Boaster")).toBeInTheDocument();
    expect(screen.getByText("Derke")).toBeInTheDocument();
  });

  it("região que ainda joga hoje fica bloqueada, e fora do agregado", () => {
    render(
      <RoundHighlights highlights={highlights({ pending: ["americas"] })} />,
    );

    // O chip continua visível — some a escolha, não a informação de que ela
    // existe — e diz por quê.
    const chip = screen.getByRole("button", { name: "Americas" });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute(
      "title",
      "Os destaques de Americas saem quando o último jogo de hoje terminar.",
    );

    // aspas é de Americas: o "Todos" também não pode entregá-lo.
    expect(screen.queryByText("aspas")).not.toBeInTheDocument();
    expect(screen.queryByText("TenZ")).not.toBeInTheDocument();
    expect(screen.getByText("Boaster")).toBeInTheDocument();
  });

  it("com todas as regiões ainda jogando, o painel diz por que está vazio", () => {
    render(
      <RoundHighlights
        highlights={highlights({ pending: ["americas", "emea"] })}
      />,
    );

    expect(
      screen.getByText(
        "Os destaques saem quando o último jogo do dia terminar.",
      ),
    ).toBeInTheDocument();
  });

  it("rodada sem ninguém pontuado é falta de dado, não espera de fim de dia", () => {
    render(
      <RoundHighlights highlights={highlights({ scorers: [], movers: [] })} />,
    );

    expect(
      screen.getByText(
        "Os destaques aparecem assim que a primeira partida for pontuada.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/último jogo do dia terminar/),
    ).not.toBeInTheDocument();
  });
});
