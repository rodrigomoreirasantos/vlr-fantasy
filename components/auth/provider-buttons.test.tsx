import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const signInSocialMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: { $ERROR_CODES: {} },
  signIn: { social: (...args: unknown[]) => signInSocialMock(...args) },
}));

import { ProviderButtons } from "@/components/auth/provider-buttons";

describe("ProviderButtons", () => {
  beforeEach(() => {
    signInSocialMock.mockReset();
  });

  it("renderiza um botão por provedor da lista", () => {
    render(<ProviderButtons providers={["google", "twitch"]} />);

    expect(
      screen.getByRole("button", { name: /continuar com o google/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continuar com a twitch/i }),
    ).toBeInTheDocument();
  });

  it("lista vazia não renderiza botão nenhum", () => {
    const { container } = render(<ProviderButtons providers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("o clique chama signIn.social com provider, callbackURL e errorCallbackURL", async () => {
    const user = userEvent.setup();
    signInSocialMock.mockResolvedValue({ data: {}, error: null });
    render(<ProviderButtons providers={["google"]} />);

    await user.click(
      screen.getByRole("button", { name: /continuar com o google/i }),
    );

    await waitFor(() =>
      expect(signInSocialMock).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/home",
        errorCallbackURL: "/login",
      }),
    );
  });

  it("botão fica desabilitado durante a navegação", async () => {
    const user = userEvent.setup();
    let resolvePromise!: (value: { data: unknown; error: null }) => void;
    signInSocialMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    render(<ProviderButtons providers={["google"]} />);

    await user.click(
      screen.getByRole("button", { name: /continuar com o google/i }),
    );

    expect(
      await screen.findByRole("button", { name: /conectando/i }),
    ).toBeDisabled();

    resolvePromise({ data: {}, error: null });
  });
});
