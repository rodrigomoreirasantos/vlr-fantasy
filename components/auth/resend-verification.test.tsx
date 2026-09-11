import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendVerificationEmailMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  sendVerificationEmail: (...args: unknown[]) =>
    sendVerificationEmailMock(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccessMock(...args) },
}));

import { ResendVerification } from "@/components/auth/resend-verification";

describe("ResendVerification", () => {
  beforeEach(() => {
    sendVerificationEmailMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("o clique chama sendVerificationEmail com o e-mail e o callbackURL", async () => {
    const user = userEvent.setup();
    sendVerificationEmailMock.mockResolvedValue({ data: {}, error: null });
    render(<ResendVerification email="joao@example.com" />);

    await user.click(
      screen.getByRole("button", { name: /não recebeu\? reenviar/i }),
    );

    await waitFor(() =>
      expect(sendVerificationEmailMock).toHaveBeenCalledWith({
        email: "joao@example.com",
        callbackURL: "/verify-email",
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Link reenviado. Confira seu e-mail.",
    );
  });

  it("depois do clique o botão fica desabilitado e mostra a contagem", async () => {
    vi.useFakeTimers();
    sendVerificationEmailMock.mockResolvedValue({ data: {}, error: null });
    render(<ResendVerification email="joao@example.com" />);

    const button = screen.getByRole("button", {
      name: /não recebeu\? reenviar/i,
    });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(button).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(button).toHaveTextContent(/reenviar em \d+s/i);

    vi.useRealTimers();
  });

  it("erro do servidor não revela existência da conta (mesma mensagem do sucesso)", async () => {
    const user = userEvent.setup();
    sendVerificationEmailMock.mockResolvedValue({
      data: null,
      error: { code: "USER_NOT_FOUND" },
    });
    render(<ResendVerification email="fantasma@example.com" />);

    await user.click(
      screen.getByRole("button", { name: /não recebeu\? reenviar/i }),
    );

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Link reenviado. Confira seu e-mail.",
      ),
    );
  });

  it("sem e-mail pré-preenchido, mostra um campo para digitar", () => {
    render(<ResendVerification />);
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
