import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FormationBoard } from "@/components/team/formation-board";
import type { RosterSlot } from "@/lib/team/types";

function slot(nickname: string, score: number, captain = false): RosterSlot {
  return {
    id: nickname.toLowerCase(),
    captain,
    warning: null,
    player: {
      id: nickname.toLowerCase(),
      nickname,
      team: "FNATIC",
      agent: "Astra",
      role: "Controlador",
      score,
      priceCents: 5000,
      active: true,
      availability: "available",
      availabilityNote: null,
      region: "emea",
    },
  };
}

describe("FormationBoard", () => {
  it("posiciona cada jogador escalado com sua pontuação", () => {
    render(
      <FormationBoard
        roster={[
          slot("Boaster", 24.6, true),
          slot("TenZ", 18.2),
          slot("Derke", 15.8),
          slot("Sacy", 9.4),
          slot("Chronicle", 6.1),
        ]}
      />,
    );

    expect(screen.getByText("Boaster")).toBeInTheDocument();
    expect(screen.getByText("Chronicle")).toBeInTheDocument();
    expect(screen.getByText("24.6")).toBeInTheDocument();
    expect(screen.getByLabelText("Capitão")).toBeInTheDocument();
  });

  it("mostra a vaga numerada quando o slot está vazio", () => {
    render(
      <FormationBoard
        roster={[
          { id: null, player: null, captain: false, warning: null },
          slot("TenZ", 18.2),
        ]}
      />,
    );

    expect(screen.getByText("Slot 1")).toBeInTheDocument();
    expect(screen.getByText("TenZ")).toBeInTheDocument();
  });

  it("ignora jogadores além das cinco posições do campo", () => {
    render(
      <FormationBoard
        roster={[
          slot("A", 10),
          slot("B", 10),
          slot("C", 10),
          slot("D", 10),
          slot("E", 10),
          slot("Excedente", 10),
        ]}
      />,
    );

    expect(screen.queryByText("Excedente")).not.toBeInTheDocument();
  });

  it("sem onSelect, os marcadores não são botões", () => {
    render(<FormationBoard roster={[slot("TenZ", 18.2)]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("com onSelect, o marcador de um jogador escalado vira botão", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FormationBoard roster={[slot("TenZ", 18.2)]} onSelect={onSelect} />,
    );

    const marker = screen.getByRole("button", {
      name: "Substituir TenZ no campo",
    });
    await user.click(marker);

    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("com onSelect, uma vaga vazia também vira botão para adicionar jogador", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FormationBoard
        roster={[{ id: null, player: null, captain: false, warning: null }]}
        onSelect={onSelect}
      />,
    );

    const marker = screen.getByRole("button", {
      name: "Adicionar jogador na vaga 1 no campo",
    });
    await user.click(marker);

    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("sem onSetCaptain, o marcador de quem não é capitão não mostra braçadeira", () => {
    render(<FormationBoard roster={[slot("TenZ", 18.2)]} />);

    expect(
      screen.queryByRole("button", { name: /capitão/i }),
    ).not.toBeInTheDocument();
  });

  it("com onSetCaptain, a braçadeira aparece mesmo em quem não é capitão e chama onSetCaptain com o índice", async () => {
    const user = userEvent.setup();
    const onSetCaptain = vi.fn();
    render(
      <FormationBoard
        roster={[slot("TenZ", 18.2)]}
        onSetCaptain={onSetCaptain}
      />,
    );

    const badge = screen.getByRole("button", {
      name: "Tornar TenZ capitão no campo",
    });
    expect(badge).toHaveAttribute("aria-pressed", "false");

    await user.click(badge);
    expect(onSetCaptain).toHaveBeenCalledWith(0);
  });

  it("com onSetCaptain e onSelect no mesmo marcador, a braçadeira e o clique de substituir não se confundem", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onSetCaptain = vi.fn();
    render(
      <FormationBoard
        roster={[slot("TenZ", 18.2)]}
        onSelect={onSelect}
        onSetCaptain={onSetCaptain}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Tornar TenZ capitão no campo" }),
    );

    expect(onSetCaptain).toHaveBeenCalledWith(0);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
