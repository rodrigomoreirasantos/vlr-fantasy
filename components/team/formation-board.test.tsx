import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormationBoard } from "@/components/team/formation-board";
import type { RosterSlot } from "@/lib/team/types";

function slot(nickname: string, score: number, captain = false): RosterSlot {
  return {
    captain,
    player: {
      id: nickname.toLowerCase(),
      nickname,
      team: "FNATIC",
      agent: "Astra",
      role: "Controlador",
      score,
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
          { player: null, captain: false },
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
});
