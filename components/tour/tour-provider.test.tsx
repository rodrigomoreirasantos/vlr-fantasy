import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Padrão de `components/championship/pending-invites.test.tsx`: mocka
// `next-safe-action/hooks` direto, em vez de tentar fazer o `useAction` de
// verdade falar com uma Server Action mockada.
const { pushMock, executeCompleteTourMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  executeCompleteTourMock: vi.fn(),
}));

vi.mock("@/app/(app)/actions", () => ({ completeTour: "completeTour-token" }));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: executeCompleteTourMock, isExecuting: false }),
}));

let currentPathname = "/home";
// Objeto único e estável: o `useRouter()` de verdade do Next também é —
// recriá-lo a cada chamada reiniciaria o efeito principal do provider em
// todo render (ele depende de `router`), abortando toda espera em andamento.
const routerMock = { push: pushMock, refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: vi.fn(() => currentPathname),
}));

import { TourProvider, useTour } from "@/components/tour/tour-provider";

pushMock.mockImplementation((route: string) => {
  currentPathname = route;
  vi.mocked(usePathname).mockReturnValue(route);
});

/**
 * Um alvo por tela, condicionado ao pathname mockado — a mesma estrutura da
 * app de verdade (cada aba só existe na própria rota), sem precisar montar
 * as quatro páginas de fato.
 */
function Stage({
  path,
  omit = [],
}: {
  path: string;
  omit?: readonly string[];
}) {
  const targets: Record<string, string[]> = {
    "/home": [
      "saldo",
      "regiao",
      "proximos-jogos",
      "fechamento-mercado",
      "desempenho",
    ],
    "/my-team": ["escalacao", "capitao", "orcamento", "relogio-mercado"],
    "/ranking": ["campeonatos"],
    "/profile": ["perfil", "conta"],
  };

  if (path !== currentPathname) return null;

  return (
    <div>
      {(targets[path] ?? [])
        .filter((id) => !omit.includes(id))
        .map((id) => (
          <div key={id} data-tour={id}>
            {id}
          </div>
        ))}
    </div>
  );
}

function TestApp({
  autoStart = true,
  omit = [],
}: {
  autoStart?: boolean;
  omit?: readonly string[];
}) {
  return (
    <TourProvider autoStart={autoStart}>
      <Stage path="/home" omit={omit} />
      <Stage path="/my-team" omit={omit} />
      <Stage path="/ranking" omit={omit} />
      <Stage path="/profile" omit={omit} />
    </TourProvider>
  );
}

/** "2 de 13" sai como `<span>2</span> de 13`, dois nós de texto — junta os dois. */
function progressText(): string {
  return screen.getByRole("dialog").querySelector("p")!.textContent!.trim();
}

beforeEach(() => {
  currentPathname = "/home";
  vi.mocked(usePathname).mockReturnValue("/home");
  pushMock.mockClear();
  executeCompleteTourMock.mockClear();
});

describe("TourProvider — abertura", () => {
  it("com autoStart, abre sozinho no convite", async () => {
    render(<TestApp />);

    expect(
      await screen.findByRole("dialog", { name: "Bem-vindo ao VLR Fantasy" }),
    ).toBeInTheDocument();
  });

  it("sem autoStart, não abre nada — useTour().start() é quem abre", async () => {
    function Trigger() {
      const { start } = useTour();
      return (
        <button type="button" onClick={start}>
          abrir
        </button>
      );
    }

    render(
      <TourProvider autoStart={false}>
        <Trigger />
      </TourProvider>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "abrir" }));

    expect(
      await screen.findByRole("dialog", { name: "Bem-vindo ao VLR Fantasy" }),
    ).toBeInTheDocument();
  });

  it("useTour() fora do provider lança", () => {
    function Lonely() {
      useTour();
      return null;
    }

    expect(() => render(<Lonely />)).toThrowError(/precisa de <TourProvider>/);
  });
});

describe("TourProvider — navegação entre passos", () => {
  it("Começar avança para o passo do saldo, com o progresso certo e foco em Próximo", async () => {
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(await screen.findByRole("button", { name: "Começar" }));

    expect(
      await screen.findByRole("dialog", { name: "Seu saldo" }),
    ).toBeInTheDocument();
    expect(progressText()).toBe("2 de 13");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Próximo" })).toHaveFocus(),
    );
  });

  it("Voltar no segundo passo retorna ao convite", async () => {
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(await screen.findByRole("button", { name: "Começar" }));
    await screen.findByRole("dialog", { name: "Seu saldo" });
    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(
      await screen.findByRole("dialog", { name: "Bem-vindo ao VLR Fantasy" }),
    ).toBeInTheDocument();
  });

  it("ao trocar de aba, navega e espera o alvo da nova página aparecer", async () => {
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(await screen.findByRole("button", { name: "Começar" }));
    // saldo (já aberto) → região → próximos jogos → fechamento → desempenho
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: "Próximo" }));
      await waitFor(() =>
        expect(screen.queryByText("Carregando…")).not.toBeInTheDocument(),
      );
    }

    expect(
      await screen.findByRole("dialog", { name: "Seus pontos" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(pushMock).toHaveBeenCalledWith("/my-team");
    expect(await screen.findByText("Carregando…")).toBeInTheDocument();

    expect(
      await screen.findByRole("dialog", { name: "Sua escalação" }),
    ).toBeInTheDocument();
  });
});

describe("TourProvider — fechar e marcar como visto", () => {
  it("Esc fecha o tour e marca como concluído uma vez", async () => {
    const user = userEvent.setup();
    render(<TestApp />);

    await screen.findByRole("dialog", { name: "Bem-vindo ao VLR Fantasy" });
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(executeCompleteTourMock).toHaveBeenCalledTimes(1);
  });

  it("'Agora não' no convite fecha e marca como concluído", async () => {
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(
      await screen.findByRole("button", { name: "Agora não" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(executeCompleteTourMock).toHaveBeenCalledTimes(1);
  });
});

describe("TourProvider — alvo ausente (Decisão 4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // `waitFor`/`findBy*` fazem polling com timers de verdade — sob
  // `vi.useFakeTimers()`, isso nunca resolve sozinho. Por isso estes dois
  // testes usam `fireEvent` (síncrono) + `act` (esvazia a fila de
  // microtasks) em vez de `userEvent`/`waitFor`, e avançam o relógio
  // explicitamente com `vi.advanceTimersByTimeAsync`.
  it("alvo que nunca aparece: o passo abre mesmo assim, centralizado, sem travar", async () => {
    render(<TestApp omit={["saldo"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Começar" }));
    await act(async () => {});

    expect(screen.getByText("Carregando…")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(
      screen.getByRole("dialog", { name: "Seu saldo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Créditos para contratar. Jogador que joga bem valoriza e rende mais na venda.",
      ),
    ).toBeInTheDocument();
  });

  it("passo com reserva: sem o alvo principal, usa o reserva (o recorte aparece)", async () => {
    const { container } = render(<TestApp omit={["fechamento-mercado"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Começar" })); // → saldo
    await act(async () => {});

    // saldo → região → próximos jogos → fechamento (target omitido)
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
      await act(async () => {});
    }

    expect(
      screen.getByRole("dialog", { name: "Fique de olho no fechamento" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Carregando…")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(screen.queryByText("Carregando…")).not.toBeInTheDocument();
    // O reserva (`proximos-jogos`) existe: o recorte tem um polígono de verdade.
    expect(container.querySelector("polygon")).not.toBeNull();
  });
});
