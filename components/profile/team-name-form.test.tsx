import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/profile/actions", () => ({
  updateTeamName: "updateTeamName-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TeamNameForm } from "@/components/profile/team-name-form";

describe("TeamNameForm", () => {
  beforeEach(() => {
    executeMock.mockClear();
  });

  it("nome com 2 caracteres: mostra erro pt-BR e não chama execute", async () => {
    const user = userEvent.setup();
    render(<TeamNameForm name="Sentinels BR" />);

    const input = screen.getByLabelText("Nome do time");
    await user.clear(input);
    await user.type(input, "Ab");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(
      await screen.findByText("Deve ter pelo menos 3 caracteres."),
    ).toBeInTheDocument();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("nome válido: chama execute com o nome", async () => {
    const user = userEvent.setup();
    render(<TeamNameForm name="Sentinels BR" />);

    const input = screen.getByLabelText("Nome do time");
    await user.clear(input);
    await user.type(input, "Nova Org");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(executeMock).toHaveBeenCalledWith({ name: "Nova Org" });
  });
});
