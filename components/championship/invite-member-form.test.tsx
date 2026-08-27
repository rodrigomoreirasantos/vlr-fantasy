import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/ranking/actions", () => ({
  inviteMember: "inviteMember-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InviteMemberForm } from "@/components/championship/invite-member-form";

describe("InviteMemberForm", () => {
  beforeEach(() => {
    executeMock.mockClear();
  });

  it("envia o login digitado sem @, junto do championshipId", async () => {
    const user = userEvent.setup();
    render(
      <InviteMemberForm championshipId="11111111-1111-4111-8111-111111111111" />,
    );

    await user.type(screen.getByLabelText("Login do amigo"), "alvo");
    await user.click(screen.getByRole("button", { name: /convidar/i }));

    expect(executeMock).toHaveBeenCalledWith({
      championshipId: "11111111-1111-4111-8111-111111111111",
      username: "alvo",
    });
  });

  it("campo vazio: mostra erro pt-BR e não chama execute", async () => {
    const user = userEvent.setup();
    render(
      <InviteMemberForm championshipId="11111111-1111-4111-8111-111111111111" />,
    );

    await user.click(screen.getByRole("button", { name: /convidar/i }));

    expect(
      await screen.findByText("Este campo é obrigatório."),
    ).toBeInTheDocument();
    expect(executeMock).not.toHaveBeenCalled();
  });
});
