import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/ranking/actions", () => ({
  respondToInvite: "respondToInvite-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeMock, isExecuting: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PendingInvites } from "@/components/championship/pending-invites";
import { TimezoneProvider } from "@/components/layout/timezone";
import type { PendingInvite } from "@/lib/championship/types";

function invite(overrides: Partial<PendingInvite> = {}): PendingInvite {
  return {
    memberId: "member-1",
    championshipId: "champ-1",
    championshipName: "Liga dos Cria",
    region: "emea",
    invitedByUsername: "rodrigo",
    invitedAt: new Date("2026-03-14T18:00:00Z"),
    ...overrides,
  };
}

describe("PendingInvites", () => {
  beforeEach(() => {
    executeMock.mockClear();
  });

  it("não renderiza nada sem convites pendentes", () => {
    const { container } = render(<PendingInvites invites={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra o nome do campeonato e quem convidou", () => {
    render(<PendingInvites invites={[invite()]} />);

    expect(screen.getByText("Liga dos Cria")).toBeInTheDocument();
    expect(screen.getByText(/@rodrigo/)).toBeInTheDocument();
  });

  it("mostra a região do campeonato e o time com que o usuário vai jogar", () => {
    render(<PendingInvites invites={[invite({ region: "emea" })]} />);

    expect(screen.getByText("EMEA")).toBeInTheDocument();
    expect(
      screen.getByText("Você entra com o seu time de EMEA."),
    ).toBeInTheDocument();
  });

  it("Aceitar chama execute com accept: true", async () => {
    const user = userEvent.setup();
    render(<PendingInvites invites={[invite()]} />);

    await user.click(screen.getByRole("button", { name: /aceitar/i }));

    expect(executeMock).toHaveBeenCalledWith({
      memberId: "member-1",
      accept: true,
    });
  });

  it("Recusar chama execute com accept: false", async () => {
    const user = userEvent.setup();
    render(<PendingInvites invites={[invite()]} />);

    await user.click(screen.getByRole("button", { name: /recusar/i }));

    expect(executeMock).toHaveBeenCalledWith({
      memberId: "member-1",
      accept: false,
    });
  });

  it("a data do convite sai no fuso default (São Paulo) — Bug 2 corrigido", () => {
    render(<PendingInvites invites={[invite()]} />);

    expect(screen.getByText(/14\/03 às 15:00/)).toBeInTheDocument();
  });

  it("a data do convite acompanha o fuso de quem está lendo", () => {
    render(
      <TimezoneProvider tz="Asia/Tokyo">
        <PendingInvites invites={[invite()]} />
      </TimezoneProvider>,
    );

    expect(screen.getByText(/15\/03 às 03:00/)).toBeInTheDocument();
  });
});
