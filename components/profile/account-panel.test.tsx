import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateUserMock, changePasswordMock, refreshMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn(),
  changePasswordMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    updateUser: updateUserMock,
    changePassword: changePasswordMock,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { AccountPanel } from "@/components/profile/account-panel";

describe("AccountPanel", () => {
  beforeEach(() => {
    updateUserMock.mockClear();
    changePasswordMock.mockClear();
    refreshMock.mockClear();
    updateUserMock.mockResolvedValue({ error: null });
    changePasswordMock.mockResolvedValue({ error: null });
  });

  it("hasPassword=false: não renderiza o formulário de senha", () => {
    render(<AccountPanel name="Rodrigo" hasPassword={false} />);

    expect(screen.queryByLabelText("Senha atual")).not.toBeInTheDocument();
    expect(
      screen.getByText("Você entra com o Google — não há senha para alterar."),
    ).toBeInTheDocument();
  });

  it("hasPassword=true: renderiza o formulário de senha", () => {
    render(<AccountPanel name="Rodrigo" hasPassword />);

    expect(screen.getByLabelText("Senha atual")).toBeInTheDocument();
  });

  it("senhas diferentes: mostra 'As senhas não conferem.' e não chama changePassword", async () => {
    const user = userEvent.setup();
    render(<AccountPanel name="Rodrigo" hasPassword />);

    await user.type(screen.getByLabelText("Senha atual"), "senha-atual");
    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-123");
    await user.type(
      screen.getByLabelText("Confirmar nova senha"),
      "outra-senha-456",
    );
    await user.click(screen.getByRole("button", { name: /trocar senha/i }));

    expect(
      await screen.findByText("As senhas não conferem."),
    ).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("nome de exibição válido: chama authClient.updateUser e atualiza a tela", async () => {
    const user = userEvent.setup();
    render(<AccountPanel name="Rodrigo" hasPassword={false} />);

    const input = screen.getByLabelText("Nome de exibição");
    await user.clear(input);
    await user.type(input, "Rodrigo Santos");
    await user.click(screen.getByRole("button", { name: /salvar nome/i }));

    expect(updateUserMock).toHaveBeenCalledWith({ name: "Rodrigo Santos" });
  });
});
