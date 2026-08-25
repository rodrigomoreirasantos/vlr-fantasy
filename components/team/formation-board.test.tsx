import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FormationBoard } from "@/components/team/formation-board";
import type { RosterSlot } from "@/lib/team/types";

function slot(nickname: string, score: number, captain = false): RosterSlot {
  return {
    id: nickname.toLowerCase(),
    captain,
    player: {
      id: nickname.toLowerCase(),
      nickname,
      team: "FNATIC",
      agent: "Astra",
      role: "Controlador",
      score,
      priceCents: 5000,
      active: true,
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
          { id: null, player: null, captain: false },
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
    render(<FormationBoard roster={[slot("TenZ", 18.2)]} onSelect={onSelect} />);

    const marker = screen.getByRole("button", {
      name: "Substituir TenZ no campo",
    });
    await user.click(marker);

    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("com onSelect, uma vaga vazia continua sem botão", () => {
    render(
      <FormationBoard
        roster={[{ id: null, player: null, captain: false }]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
