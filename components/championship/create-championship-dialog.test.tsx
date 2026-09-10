import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock, pushMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/app/(app)/ranking/actions", () => ({
  createChampionship: "createChampionship-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CreateChampionshipDialog } from "@/components/championship/create-championship-dialog";

describe("CreateChampionshipDialog", () => {
  beforeEach(() => {
    executeMock.mockClear();
    pushMock.mockClear();
  });

  it("nome curto: mostra erro pt-BR e não chama execute", async () => {
    const user = userEvent.setup();
    render(<CreateChampionshipDialog />);

    await user.click(screen.getByRole("button", { name: /criar campeonato/i }));
    await user.type(screen.getByLabelText("Nome"), "Ab");
    await user.click(screen.getByRole("button", { name: /^criar$/i }));

    expect(
      await screen.findByText("Deve ter pelo menos 3 caracteres."),
    ).toBeInTheDocument();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("nome válido: chama execute com o nome e a região padrão (Americas)", async () => {
    const user = userEvent.setup();
    render(<CreateChampionshipDialog />);

    await user.click(screen.getByRole("button", { name: /criar campeonato/i }));
    await user.type(screen.getByLabelText("Nome"), "Liga dos Cria");
    await user.click(screen.getByRole("button", { name: /^criar$/i }));

    expect(executeMock).toHaveBeenCalledWith({
      name: "Liga dos Cria",
      region: "americas",
    });
  });

  it("permite escolher outra região", async () => {
    const user = userEvent.setup();
    render(<CreateChampionshipDialog />);

    await user.click(screen.getByRole("button", { name: /criar campeonato/i }));
    await user.type(screen.getByLabelText("Nome"), "Liga dos Cria");
    await user.click(screen.getByRole("combobox", { name: /região/i }));
    await user.click(screen.getByRole("option", { name: "EMEA" }));
    await user.click(screen.getByRole("button", { name: /^criar$/i }));

    expect(executeMock).toHaveBeenCalledWith({
      name: "Liga dos Cria",
      region: "emea",
    });
  });

  it("com defaultRegion='emea', o Select de região já abre em EMEA", async () => {
    const user = userEvent.setup();
    render(<CreateChampionshipDialog defaultRegion="emea" />);

    await user.click(screen.getByRole("button", { name: /criar campeonato/i }));
    await user.type(screen.getByLabelText("Nome"), "Liga dos Cria");
    await user.click(screen.getByRole("button", { name: /^criar$/i }));

    expect(executeMock).toHaveBeenCalledWith({
      name: "Liga dos Cria",
      region: "emea",
    });
  });
});
