import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const signInEmailMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { $ERROR_CODES: {} },
  signIn: { email: (...args: unknown[]) => signInEmailMock(...args) },
}));

import { SignInForm } from "@/components/auth/sign-in-form";

describe("SignInForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    signInEmailMock.mockReset();
  });

  it("mostra 'E-mail inválido.' para um e-mail mal formatado", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText("E-mail"), "não-é-um-email");
    await user.type(screen.getByLabelText("Senha"), "qualquer-senha");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByText("E-mail inválido.")).toBeInTheDocument();
    expect(signInEmailMock).not.toHaveBeenCalled();
  });

  it("chama signIn.email com os dados corretos em um submit válido", async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({ data: {}, error: null });
    render(<SignInForm />);

    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() =>
      expect(signInEmailMock).toHaveBeenCalledWith({
        email: "joao@example.com",
        password: "senha1234",
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/home");
  });

  it("mostra 'E-mail ou senha incorretos.' quando as credenciais são inválidas", async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({
      data: null,
      error: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
    render(<SignInForm />);

    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-errada");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "E-mail ou senha incorretos.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("EMAIL_NOT_VERIFIED renderiza um link para /check-email com o e-mail digitado", async () => {
    const user = userEvent.setup();
    signInEmailMock.mockResolvedValue({
      data: null,
      error: { code: "EMAIL_NOT_VERIFIED" },
    });
    render(<SignInForm />);

    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    const link = await screen.findByRole("link", {
      name: /não recebeu\? reenviar/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "/check-email?email=joao%40example.com",
    );
  });

  it("existe um link acessível 'Esqueci minha senha' apontando para /forgot-password", () => {
    render(<SignInForm />);

    expect(
      screen.getByRole("link", { name: /esqueci minha senha/i }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("desabilita o botão durante o envio", async () => {
    const user = userEvent.setup();
    let resolvePromise!: (value: { data: unknown; error: null }) => void;
    signInEmailMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    render(<SignInForm />);

    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    expect(
      await screen.findByRole("button", { name: /entrando/i }),
    ).toBeDisabled();

    resolvePromise({ data: {}, error: null });
  });
});
