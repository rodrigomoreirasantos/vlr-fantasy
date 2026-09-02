import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const signInSocialMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: { $ERROR_CODES: {} },
  signIn: { social: (...args: unknown[]) => signInSocialMock(...args) },
}));

import { GoogleButton } from "@/components/auth/google-button";

describe("GoogleButton", () => {
  beforeEach(() => {
    signInSocialMock.mockReset();
  });

  it("dispara signIn.social com provider 'google' ao clicar", async () => {
    const user = userEvent.setup();
    signInSocialMock.mockResolvedValue({ data: {}, error: null });
    render(<GoogleButton />);

    await user.click(
      screen.getByRole("button", { name: /continuar com o google/i }),
    );

    await waitFor(() =>
      expect(signInSocialMock).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/home",
      }),
    );
  });
});
