import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const executeMock = vi.hoisted(() => vi.fn());
/** Erro que o `execute` mockado devolve via `onError` — `null` = sucesso. */
const serverErrorRef = vi.hoisted(() => ({ current: null as string | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/app/(auth)/signup/actions", () => ({
  signUpWithTeam: "signUpWithTeam-token",
}));

vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    _action: unknown,
    options: {
      onExecute?: () => void;
      onSuccess?: () => void;
      onError?: (result: { error: { serverError?: string } }) => void;
    },
  ) => ({
    isExecuting: false,
    execute: (input: unknown) => {
      executeMock(input);
      options.onExecute?.();
      if (serverErrorRef.current) {
        options.onError?.({ error: { serverError: serverErrorRef.current } });
      } else {
        options.onSuccess?.();
      }
    },
  }),
}));

import { SignUpForm } from "@/components/auth/sign-up-form";

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
  await user.type(screen.getByLabelText("Nome do time"), "Sentinels BR");
  await user.type(screen.getByLabelText("Nickname"), "joaosilva");
  await user.type(screen.getByLabelText("Senha"), "senha1234");
  await user.type(screen.getByLabelText("Confirmar senha"), "senha1234");
}

describe("SignUpForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    executeMock.mockClear();
    serverErrorRef.current = null;
  });

  it("mostra mensagens de validação pt-BR ao submeter vazio", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.click(screen.getByRole("button", { name: /criar conta/i }));

    expect(await screen.findByText("E-mail inválido.")).toBeInTheDocument();
    expect(
      screen.getAllByText("Deve ter pelo menos 3 caracteres."),
    ).toHaveLength(2); // nome do time e nickname
    expect(
      screen.getAllByText("Deve ter pelo menos 8 caracteres.").length,
    ).toBeGreaterThan(0);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("mostra erro quando o nickname tem caracteres inválidos", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("Nickname"), "rodrigo santos!");
    await user.click(screen.getByRole("button", { name: /criar conta/i }));

    expect(
      await screen.findByText("Use apenas letras, números, ponto e underline."),
    ).toBeInTheDocument();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("mostra erro quando as senhas não coincidem", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.type(screen.getByLabelText("Nome do time"), "Sentinels BR");
    await user.type(screen.getByLabelText("Nickname"), "joaosilva");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.type(
      screen.getByLabelText("Confirmar senha"),
      "senha-diferente",
    );
    await user.click(screen.getByRole("button", { name: /criar conta/i }));

    expect(
      await screen.findByText("As senhas não coincidem."),
    ).toBeInTheDocument();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("envia e-mail, nome do time, nickname e senha em um submit válido", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /criar conta/i }));

    await waitFor(() =>
      expect(executeMock).toHaveBeenCalledWith({
        email: "joao@example.com",
        teamName: "Sentinels BR",
        username: "joaosilva",
        password: "senha1234",
        confirmPassword: "senha1234",
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/home");
  });

  it("mostra a mensagem do servidor quando o nome do time já existe", async () => {
    serverErrorRef.current = "Já existe um time com esse nome. Escolha outro.";
    const user = userEvent.setup();
    render(<SignUpForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /criar conta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Já existe um time com esse nome. Escolha outro.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
