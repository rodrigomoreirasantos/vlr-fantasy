import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const pushMock = vi.fn();
const resetPasswordMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { $ERROR_CODES: {} },
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
}));

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
    resetPasswordMock.mockReset();
  });

  it("senhas diferentes mostram 'As senhas não coincidem.' e não chamam a API", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok_123" />);

    await user.type(screen.getByLabelText("Nova senha"), "senha1234");
    await user.type(
      screen.getByLabelText("Confirmar nova senha"),
      "senha-diferente",
    );
    await user.click(screen.getByRole("button", { name: /redefinir senha/i }));

    expect(
      await screen.findByText("As senhas não coincidem."),
    ).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("submit válido chama resetPassword com { newPassword, token }", async () => {
    const user = userEvent.setup();
    resetPasswordMock.mockResolvedValue({ data: {}, error: null });
    render(<ResetPasswordForm token="tok_123" />);

    await user.type(screen.getByLabelText("Nova senha"), "senha1234");
    await user.type(screen.getByLabelText("Confirmar nova senha"), "senha1234");
    await user.click(screen.getByRole("button", { name: /redefinir senha/i }));

    await waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith({
        newPassword: "senha1234",
        token: "tok_123",
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/login?reset=1");
  });

  it("INVALID_TOKEN vira 'Este link é inválido ou já foi usado. Peça um novo.'", async () => {
    const user = userEvent.setup();
    resetPasswordMock.mockResolvedValue({
      data: null,
      error: { code: "INVALID_TOKEN" },
    });
    render(<ResetPasswordForm token="tok_123" />);

    await user.type(screen.getByLabelText("Nova senha"), "senha1234");
    await user.type(screen.getByLabelText("Confirmar nova senha"), "senha1234");
    await user.click(screen.getByRole("button", { name: /redefinir senha/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este link é inválido ou já foi usado. Peça um novo.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
