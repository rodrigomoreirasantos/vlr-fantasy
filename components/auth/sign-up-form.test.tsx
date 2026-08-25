import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const signUpEmailMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { $ERROR_CODES: {} },
  signUp: { email: (...args: unknown[]) => signUpEmailMock(...args) },
}));

import { SignUpForm } from "@/components/auth/sign-up-form";

describe("SignUpForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    signUpEmailMock.mockReset();
  });

  it("mostra mensagens de validação pt-BR ao submeter vazio", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.click(screen.getByRole("button", { name: /criar conta/i }));

    expect(
      await screen.findByText("Deve ter pelo menos 2 caracteres."),
    ).toBeInTheDocument();
    expect(screen.getByText("E-mail inválido.")).toBeInTheDocument();
    expect(
      screen.getAllByText("Deve ter pelo menos 8 caracteres.").length,
    ).toBeGreaterThan(0);
    expect(signUpEmailMock).not.toHaveBeenCalled();
  });

  it("mostra erro quando as senhas não coincidem", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Nome"), "João da Silva");
    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.type(
      screen.getByLabelText("Confirmar senha"),
      "senha-diferente",
    );
    await user.click(screen.getByRole("button", { name: /criar conta/i }));

    expect(
      await screen.findByText("As senhas não coincidem."),
    ).toBeInTheDocument();
    expect(signUpEmailMock).not.toHaveBeenCalled();
  });

  it("chama signUp.email com os dados corretos em um submit válido", async () => {
    const user = userEvent.setup();
    signUpEmailMock.mockResolvedValue({ data: {}, error: null });
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Nome"), "João da Silva");
    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.type(screen.getByLabelText("Confirmar senha"), "senha1234");
    await user.click(screen.getByRole("button", { name: /criar conta/i }));

    await waitFor(() =>
      expect(signUpEmailMock).toHaveBeenCalledWith({
        name: "João da Silva",
        email: "joao@example.com",
        password: "senha1234",
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/my-team");
  });

  it("mostra a mensagem traduzida quando o e-mail já existe", async () => {
    const user = userEvent.setup();
    signUpEmailMock.mockResolvedValue({
      data: null,
      error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Nome"), "João da Silva");
    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.type(screen.getByLabelText("Confirmar senha"), "senha1234");
    await user.click(screen.getByRole("button", { name: /criar conta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Já existe uma conta com este e-mail.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
