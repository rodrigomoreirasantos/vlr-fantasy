import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
// Guarda as opções de `useAction` para o teste disparar o `onSuccess`.
const actionOptions = vi.hoisted(() => ({
  current: null as null | { onSuccess?: () => void },
}));

vi.mock("@/app/(app)/ranking/actions", () => ({
  respondToInvite: "respondToInvite-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: { onSuccess?: () => void }) => {
    actionOptions.current = options;
    return { execute: executeMock, isExecuting: false };
  },
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: vi.fn() },
}));

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
    toastSuccessMock.mockClear();
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

  it("com mais de 2 convites, mostra 2 e um botão para ver o resto", async () => {
    const user = userEvent.setup();
    render(
      <PendingInvites
        invites={[
          invite({ memberId: "m1", championshipName: "Liga 1" }),
          invite({ memberId: "m2", championshipName: "Liga 2" }),
          invite({ memberId: "m3", championshipName: "Liga 3" }),
          invite({ memberId: "m4", championshipName: "Liga 4" }),
        ]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Liga 3")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", {
      name: "Ver todos os convites (+2)",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Liga 4")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mostrar menos" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("com até 2 convites, não há botão de ver todos", () => {
    render(
      <PendingInvites
        invites={[invite({ memberId: "m1" }), invite({ memberId: "m2" })]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /ver todos/i }),
    ).not.toBeInTheDocument();
  });

  it("aceitar avisa em qual campeonato o usuário entrou", async () => {
    const user = userEvent.setup();
    render(<PendingInvites invites={[invite()]} />);

    await user.click(screen.getByRole("button", { name: /aceitar/i }));
    act(() => actionOptions.current?.onSuccess?.());

    expect(toastSuccessMock).toHaveBeenCalledWith("Você entrou em Liga dos Cria.");
  });

  it("recusar avisa qual convite foi recusado", async () => {
    const user = userEvent.setup();
    render(<PendingInvites invites={[invite()]} />);

    await user.click(screen.getByRole("button", { name: /recusar/i }));
    act(() => actionOptions.current?.onSuccess?.());

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Convite para Liga dos Cria recusado.",
    );
  });
});
