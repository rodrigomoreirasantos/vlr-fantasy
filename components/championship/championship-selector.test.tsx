import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { ChampionshipSelector } from "@/components/championship/championship-selector";
import type { ChampionshipSummary } from "@/lib/championship/types";

function championship(
  overrides: Partial<ChampionshipSummary>,
): ChampionshipSummary {
  return {
    id: "champ-1",
    name: "Liga dos Cria",
    ownerId: "user-1",
    region: "americas",
    memberCount: 1,
    ...overrides,
  };
}

describe("ChampionshipSelector", () => {
  it("com um único campeonato, mostra o nome sem Select", () => {
    render(
      <ChampionshipSelector
        championships={[championship({})]}
        selectedId="champ-1"
      />,
    );

    expect(screen.getByText("Liga dos Cria")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("com múltiplos campeonatos, mostra um Select com o campeonato selecionado", () => {
    render(
      <ChampionshipSelector
        championships={[
          championship({ id: "champ-1", name: "Liga dos Cria" }),
          championship({ id: "champ-2", name: "Liga do Trabalho" }),
        ]}
        selectedId="champ-1"
      />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Liga dos Cria");
  });

  it("trocar de campeonato navega para /ranking?c=<id>", async () => {
    const user = userEvent.setup();
    render(
      <ChampionshipSelector
        championships={[
          championship({ id: "champ-1", name: "Liga dos Cria" }),
          championship({ id: "champ-2", name: "Liga do Trabalho" }),
        ]}
        selectedId="champ-1"
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Liga do Trabalho" }),
    );

    expect(pushMock).toHaveBeenCalledWith("/ranking?c=champ-2");
  });
});
