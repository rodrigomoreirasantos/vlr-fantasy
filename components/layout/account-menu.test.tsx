import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, refreshMock, signOutMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: signOutMock,
}));

import { AccountMenu } from "@/components/layout/account-menu";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AccountMenu", () => {
  it("o gatilho tem nome acessível com o @login e mostra o handle", () => {
    render(<AccountMenu displayName="Rodrigo Santos" username="rodrigo" />);

    expect(
      screen.getByRole("button", { name: "Abrir menu da conta (@rodrigo)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("@rodrigo")).toBeInTheDocument();
  });

  it("abrindo o menu, mostra o nome de exibição e o @login no rótulo", async () => {
    const user = userEvent.setup();
    render(<AccountMenu displayName="Rodrigo Santos" username="rodrigo" />);

    await user.click(
      screen.getByRole("button", { name: /abrir menu da conta/i }),
    );

    expect(await screen.findByText("Rodrigo Santos")).toBeInTheDocument();
    // Duas ocorrências: o gatilho (fora do menu) e o rótulo dentro dele.
    expect(screen.getAllByText("@rodrigo")).toHaveLength(2);
  });

  it("clicar em 'Sair' chama signOut e, resolvido, redireciona para /login", async () => {
    const user = userEvent.setup();
    signOutMock.mockResolvedValue(undefined);
    render(<AccountMenu displayName="Rodrigo Santos" username="rodrigo" />);

    await user.click(
      screen.getByRole("button", { name: /abrir menu da conta/i }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /sair/i }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/login");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("enquanto sai, mostra 'Saindo…' e ignora um segundo clique", async () => {
    const user = userEvent.setup();
    let resolveSignOut!: () => void;
    signOutMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignOut = resolve;
      }),
    );
    render(<AccountMenu displayName="Rodrigo Santos" username="rodrigo" />);

    await user.click(
      screen.getByRole("button", { name: /abrir menu da conta/i }),
    );
    const item = await screen.findByRole("menuitem", { name: /sair/i });
    await user.click(item);

    expect(await screen.findByText("Saindo…")).toBeInTheDocument();

    // Segundo clique no mesmo item, ainda pendente: não chama signOut de novo.
    await user.click(item);
    expect(signOutMock).toHaveBeenCalledTimes(1);

    resolveSignOut();
  });

  it("sem username, o gatilho e o menu caem no nome de exibição", async () => {
    const user = userEvent.setup();
    render(<AccountMenu displayName="Rodrigo Santos" username={null} />);

    expect(
      screen.getByRole("button", {
        name: "Abrir menu da conta (Rodrigo Santos)",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /abrir menu da conta/i }),
    );

    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
  });
});
