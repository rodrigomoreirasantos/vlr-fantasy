import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmptyPlayerRow, PlayerRow } from "@/components/team/player-row";
import type { Player } from "@/lib/team/types";

const player: Player = {
  id: "tenz",
  nickname: "TenZ",
  team: "SENTINELS",
  agent: "Jett",
  role: "Duelista",
  score: 18.2,
  priceCents: 5000,
  formPoints: null,
  active: true,
  availability: "available",
  availabilityNote: null,
  region: "americas",
  photoUrl: null,
};

describe("PlayerRow", () => {
  it("mostra apelido, organização e função do jogador — sem o agente", () => {
    render(
      <ul>
        <PlayerRow player={player} />
      </ul>,
    );

    expect(screen.getByText("TenZ")).toBeInTheDocument();
    expect(screen.getByText("SENTINELS")).toBeInTheDocument();
    expect(screen.getByText("Duelista")).toBeInTheDocument();
    expect(screen.queryByText(/Jett/)).not.toBeInTheDocument();
  });

  it("exibe a pontuação com uma casa decimal e a unidade, para não se confundir com preço", () => {
    render(
      <ul>
        <PlayerRow player={{ ...player, score: 9 }} />
      </ul>,
    );

    expect(screen.getByText("9.0")).toBeInTheDocument();
    expect(screen.getByText("PTS")).toBeInTheDocument();
  });

  it("marca o capitão de forma acessível", () => {
    render(
      <ul>
        <PlayerRow player={player} captain />
      </ul>,
    );

    expect(screen.getByLabelText("Capitão")).toBeInTheDocument();
  });

  it("não marca capitão quando o jogador não é o capitão", () => {
    render(
      <ul>
        <PlayerRow player={player} />
      </ul>,
    );

    expect(screen.queryByLabelText("Capitão")).not.toBeInTheDocument();
  });

  it("sem onSelect, é uma linha inerte — sem botão", () => {
    render(
      <ul>
        <PlayerRow player={player} />
      </ul>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("com onSelect, vira um botão que dispara a seleção ao ser clicado", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ul>
        <PlayerRow player={player} onSelect={onSelect} />
      </ul>,
    );

    const button = screen.getByRole("button", { name: /substituir tenz/i });
    await user.click(button);

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("reflete `selected` em aria-expanded", () => {
    render(
      <ul>
        <PlayerRow player={player} onSelect={() => {}} selected />
      </ul>,
    );

    expect(
      screen.getByRole("button", { name: /substituir tenz/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("sem onSetCaptain, quem não é capitão não mostra braçadeira nenhuma", () => {
    render(
      <ul>
        <PlayerRow player={player} />
      </ul>,
    );

    expect(
      screen.queryByRole("button", { name: /capitão/i }),
    ).not.toBeInTheDocument();
  });

  it("com onSetCaptain, a braçadeira aparece mesmo em quem não é capitão e chama onSetCaptain ao clicar", async () => {
    const user = userEvent.setup();
    const onSetCaptain = vi.fn();
    render(
      <ul>
        <PlayerRow player={player} onSetCaptain={onSetCaptain} />
      </ul>,
    );

    const badge = screen.getByRole("button", { name: "Tornar TenZ capitão" });
    expect(badge).toHaveAttribute("aria-pressed", "false");

    await user.click(badge);
    expect(onSetCaptain).toHaveBeenCalledOnce();
  });

  it("com onSetCaptain e captain, a braçadeira reflete que já é capitão", () => {
    render(
      <ul>
        <PlayerRow player={player} captain onSetCaptain={() => {}} />
      </ul>,
    );

    const badge = screen.getByRole("button", { name: "TenZ é o capitão" });
    expect(badge).toHaveAttribute("aria-pressed", "true");
  });

  it("a braçadeira não conflita com o clique de substituir — são botões distintos", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onSetCaptain = vi.fn();
    render(
      <ul>
        <PlayerRow
          player={player}
          onSelect={onSelect}
          onSetCaptain={onSetCaptain}
        />
      </ul>,
    );

    await user.click(
      screen.getByRole("button", { name: "Tornar TenZ capitão" }),
    );

    expect(onSetCaptain).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("sem onSell, não mostra o botão de vender", () => {
    render(
      <ul>
        <PlayerRow player={player} />
      </ul>,
    );

    expect(
      screen.queryByRole("button", { name: /vender/i }),
    ).not.toBeInTheDocument();
  });

  it("sem warning, o selo de fora do escopo não aparece", () => {
    render(
      <ul>
        <PlayerRow player={player} />
      </ul>,
    );

    expect(
      screen.queryByText(/joga em|fora do internacional/i),
    ).not.toBeInTheDocument();
  });

  it("com warning 'out-of-region', mostra o selo com a região atual", () => {
    render(
      <ul>
        <PlayerRow
          player={player}
          warning={{ kind: "out-of-region", region: "emea" }}
        />
      </ul>,
    );

    expect(screen.getByText("Joga em EMEA")).toBeInTheDocument();
  });

  it("com warning 'unknown-region', não afirma que ele mudou de liga", () => {
    render(
      <ul>
        <PlayerRow player={player} warning={{ kind: "unknown-region" }} />
      </ul>,
    );

    expect(screen.getByText("Região indefinida")).toBeInTheDocument();
    expect(screen.queryByText(/joga em/i)).not.toBeInTheDocument();
  });

  it("com warning 'not-qualified', mostra o selo do internacional", () => {
    render(
      <ul>
        <PlayerRow player={player} warning={{ kind: "not-qualified" }} />
      </ul>,
    );

    expect(screen.getByText("Fora do internacional")).toBeInTheDocument();
  });

  it("com onSell, o botão Vender aparece e chama onSell ao clicar, sem disparar onSelect", async () => {
    const user = userEvent.setup();
    const onSell = vi.fn();
    const onSelect = vi.fn();
    render(
      <ul>
        <PlayerRow player={player} onSelect={onSelect} onSell={onSell} />
      </ul>,
    );

    await user.click(screen.getByRole("button", { name: "Vender TenZ" }));

    expect(onSell).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("EmptyPlayerRow", () => {
  it("indica a posição vaga na escalação", () => {
    render(
      <ul>
        <EmptyPlayerRow position={3} />
      </ul>,
    );

    expect(screen.getByText("Adicionar jogador")).toBeInTheDocument();
    expect(screen.getByText("Vaga 3")).toBeInTheDocument();
  });

  it("sem onSelect, não é um botão", () => {
    render(
      <ul>
        <EmptyPlayerRow position={3} />
      </ul>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("com onSelect, vira um botão que dispara a seleção da vaga", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ul>
        <EmptyPlayerRow position={3} onSelect={onSelect} />
      </ul>,
    );

    await user.click(
      screen.getByRole("button", { name: "Adicionar jogador na vaga 3" }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
