import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const requestPasswordResetMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: { $ERROR_CODES: {} },
  requestPasswordReset: (...args: unknown[]) =>
    requestPasswordResetMock(...args),
}));

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

const SUCCESS_MESSAGE =
  "Se existir uma conta com esse e-mail, enviamos o link de redefinição.";

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    requestPasswordResetMock.mockReset();
  });

  it("e-mail malformado mostra 'E-mail inválido.' e não chama a API", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("E-mail"), "não-é-um-email");
    await user.click(
      screen.getByRole("button", { name: /enviar link de redefinição/i }),
    );

    expect(await screen.findByText("E-mail inválido.")).toBeInTheDocument();
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it("submit válido chama requestPasswordReset com redirectTo: '/reset-password'", async () => {
    const user = userEvent.setup();
    requestPasswordResetMock.mockResolvedValue({ data: {}, error: null });
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.click(
      screen.getByRole("button", { name: /enviar link de redefinição/i }),
    );

    await waitFor(() =>
      expect(requestPasswordResetMock).toHaveBeenCalledWith({
        email: "joao@example.com",
        redirectTo: "/reset-password",
      }),
    );
    expect(await screen.findByText(SUCCESS_MESSAGE)).toBeInTheDocument();
  });

  it("erro USER_NOT_FOUND do servidor produz exatamente a mesma tela de sucesso", async () => {
    const user = userEvent.setup();
    requestPasswordResetMock.mockResolvedValue({
      data: null,
      error: { code: "USER_NOT_FOUND" },
    });
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("E-mail"), "fantasma@example.com");
    await user.click(
      screen.getByRole("button", { name: /enviar link de redefinição/i }),
    );

    expect(await screen.findByText(SUCCESS_MESSAGE)).toBeInTheDocument();
  });

  it("desabilita o botão durante o envio", async () => {
    const user = userEvent.setup();
    let resolvePromise!: (value: { data: unknown; error: null }) => void;
    requestPasswordResetMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("E-mail"), "joao@example.com");
    await user.click(
      screen.getByRole("button", { name: /enviar link de redefinição/i }),
    );

    expect(
      await screen.findByRole("button", { name: /enviando/i }),
    ).toBeDisabled();

    resolvePromise({ data: {}, error: null });
  });
});
