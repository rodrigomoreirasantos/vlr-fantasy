import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/ranking/actions", () => ({
  createChampionship: "createChampionship-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isExecuting: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ChampionshipRail } from "@/components/championship/championship-rail";
import type { ChampionshipCardData } from "@/lib/championship/types";

function championship(
  overrides: Partial<ChampionshipCardData>,
): ChampionshipCardData {
  return {
    id: "champ-1",
    name: "Liga dos Cria",
    ownerId: "owner-1",
    region: "americas",
    memberCount: 4,
    myPosition: 2,
    ...overrides,
  };
}

describe("ChampionshipRail", () => {
  it("mostra nome, membros e a posição do usuário em cada card", () => {
    render(
      <ChampionshipRail
        championships={[championship({})]}
        selectedId="champ-1"
        region="americas"
      />,
    );

    expect(screen.getByText("Liga dos Cria")).toBeInTheDocument();
    expect(screen.getByText("4 membros")).toBeInTheDocument();
    expect(screen.getByText("Você: 2º")).toBeInTheDocument();
  });

  it("o card selecionado tem aria-current", () => {
    render(
      <ChampionshipRail
        championships={[
          championship({ id: "a", name: "Um" }),
          championship({ id: "b", name: "Dois" }),
        ]}
        selectedId="b"
        region="americas"
      />,
    );

    expect(screen.getByRole("link", { name: /dois/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /um/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("cada card aponta para o campeonato certo", () => {
    render(
      <ChampionshipRail
        championships={[championship({ id: "champ-9" })]}
        selectedId="champ-9"
        region="americas"
      />,
    );

    expect(screen.getByRole("link", { name: /liga dos cria/i })).toHaveAttribute(
      "href",
      "/ranking?c=champ-9",
    );
  });

  it("sem posição atribuída, não mostra 'Você'", () => {
    render(
      <ChampionshipRail
        championships={[championship({ myPosition: null })]}
        selectedId="champ-1"
        region="americas"
      />,
    );

    expect(screen.queryByText(/você:/i)).not.toBeInTheDocument();
  });

  it("o último item abre o diálogo de criar campeonato", async () => {
    const user = userEvent.setup();
    render(
      <ChampionshipRail
        championships={[championship({})]}
        selectedId="champ-1"
        region="americas"
      />,
    );

    await user.click(screen.getByRole("button", { name: /criar campeonato/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
