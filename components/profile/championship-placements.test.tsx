import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChampionshipPlacements } from "@/components/profile/championship-placements";

describe("ChampionshipPlacements", () => {
  it("estado vazio: mensagem pt-BR com link para /ranking", () => {
    render(<ChampionshipPlacements placements={[]} />);

    expect(
      screen.getByText("Você ainda não está em nenhum campeonato."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ver campeonatos/i }),
    ).toHaveAttribute("href", "/ranking");
  });

  it("renderiza a colocação e linka para /ranking?c=<id>", () => {
    render(
      <ChampionshipPlacements
        placements={[
          {
            championship: {
              id: "champ-1",
              name: "Liga dos Amigos",
              ownerId: "user-1",
              memberCount: 6,
            },
            position: 2,
            points: 148,
          },
        ]}
      />,
    );

    expect(screen.getByText("Liga dos Amigos")).toBeInTheDocument();
    expect(screen.getByText("2º")).toBeInTheDocument();
    expect(screen.getByText("148.0")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /liga dos amigos/i }),
    ).toHaveAttribute("href", "/ranking?c=champ-1");
  });
});
