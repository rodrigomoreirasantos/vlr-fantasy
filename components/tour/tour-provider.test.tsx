import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Padrão de `components/championship/pending-invites.test.tsx`: mocka
// `next-safe-action/hooks` direto, em vez de tentar fazer o `useAction` de
// verdade falar com uma Server Action mockada.
const { pushMock, prefetchMock, executeCompleteTourMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  prefetchMock: vi.fn(),
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
const routerMock = { push: pushMock, refresh: vi.fn(), prefetch: prefetchMock };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: vi.fn(() => currentPathname),
}));

import { TourProvider, useTour } from "@/components/tour/tour-provider";

/**
 * Simula a navegação de verdade do App Router (plano 27, Fase 3 —
 * `.claude/plans/27-tour-passo-a-passo.md`): `router.push` só **começa** a
 * troca de rota — o `pathname` só muda quando o servidor termina de
 * responder. `pushMock` fica mudo de propósito (nenhum `mockImplementation`
 * que atualize o pathname sozinho): é exatamente essa demora que reproduz o
 * bug do cartão anunciando a tela nova antes dela existir.
 *
 * No app de verdade, `usePathname()` é um contexto de verdade do Next: a
 * mudança de rota re-renderiza sozinha quem o lê. Aqui é um mock — por isso
 * o `rerender` explícito, para forçar o `TourProvider` a chamar
 * `usePathname()` de novo, exatamente como aconteceria na troca real.
 */
function commitNavigation(
  route: string,
  rerender: (ui: React.ReactElement) => void,
  ui: React.ReactElement,
) {
  currentPathname = route;
  vi.mocked(usePathname).mockReturnValue(route);
  rerender(ui);
}

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

/** O botão de avançar do passo atual — "Começar", "Próximo" ou "Concluir". */
function advanceButton() {
  return screen.getByRole("button", { name: /^(Começar|Próximo|Concluir)$/ });
}

beforeEach(() => {
  currentPathname = "/home";
  vi.mocked(usePathname).mockReturnValue("/home");
  pushMock.mockClear();
  prefetchMock.mockClear();
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

  it("ao trocar de aba: segura o passo anterior até a rota nova chegar (plano 27)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TestApp />);

    await user.click(await screen.findByRole("button", { name: "Começar" }));
    // saldo (já aberto) → região → próximos jogos → fechamento → desempenho
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: "Próximo" }));
      await screen.findByRole("dialog");
    }
    await screen.findByRole("dialog", { name: "Seus pontos" });
    expect(progressText()).toBe("6 de 13");

    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(pushMock).toHaveBeenCalledWith("/my-team");
    // Segurando: título, texto e contador continuam do passo anterior — o
    // cartão nunca anuncia "Sua escalação" antes de /my-team existir.
    expect(
      screen.getByRole("dialog", { name: "Seus pontos" }),
    ).toBeInTheDocument();
    expect(progressText()).toBe("6 de 13");
    expect(advanceButton()).toHaveAttribute("aria-busy", "true");
    expect(advanceButton()).toBeDisabled();

    // A rota "chega" — o efeito nota o pathname novo e resolve o alvo.
    commitNavigation("/my-team", rerender, <TestApp />);

    expect(
      await screen.findByRole("dialog", { name: "Sua escalação" }),
    ).toBeInTheDocument();
    expect(progressText()).toBe("7 de 13");
    expect(advanceButton()).not.toBeDisabled();
  });

  it("o recorte não muda de alvo enquanto a rota nova não chega", async () => {
    const user = userEvent.setup();
    const { container } = render(<TestApp />);

    await user.click(await screen.findByRole("button", { name: "Começar" }));
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: "Próximo" }));
      await screen.findByRole("dialog");
    }
    await screen.findByRole("dialog", { name: "Seus pontos" });
    expect(container.querySelector("polygon")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Próximo" }));

    // Ainda "Seus pontos": o recorte não pulou para um alvo de /my-team que
    // ainda não existe no DOM.
    expect(
      screen.getByRole("dialog", { name: "Seus pontos" }),
    ).toBeInTheDocument();
    expect(container.querySelector("polygon")).not.toBeNull();
  });

  it("pré-carrega a rota do próximo passo assim que o atual fica pronto", async () => {
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(await screen.findByRole("button", { name: "Começar" }));
    await screen.findByRole("dialog", { name: "Seu saldo" });

    // Passo do saldo (route "/home") pronto → o próximo (região, também
    // "/home") não precisa de prefetch; só quando a rota realmente muda.
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole("button", { name: "Próximo" }));
      await screen.findByRole("dialog");
    }
    await screen.findByRole("dialog", { name: "Fique de olho no fechamento" });

    // Passo seguinte é "desempenho" (ainda /home) — nada para pré-carregar.
    expect(prefetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await screen.findByRole("dialog", { name: "Seus pontos" });

    // Passo seguinte ("escalação") é em /my-team — pré-carregado.
    expect(prefetchMock).toHaveBeenCalledWith("/my-team");
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

  it("reabrir pelo menu depois de concluído volta ao convite, não ao último passo", async () => {
    const user = userEvent.setup();

    function Trigger() {
      const { start } = useTour();
      return (
        <button type="button" onClick={start}>
          reabrir
        </button>
      );
    }

    render(
      <TourProvider autoStart={false}>
        <Trigger />
        <Stage path="/home" />
        <Stage path="/my-team" />
        <Stage path="/ranking" />
        <Stage path="/profile" />
      </TourProvider>,
    );

    await user.click(screen.getByRole("button", { name: "reabrir" }));
    await screen.findByRole("dialog", { name: "Bem-vindo ao VLR Fantasy" });
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "reabrir" }));

    expect(
      await screen.findByRole("dialog", { name: "Bem-vindo ao VLR Fantasy" }),
    ).toBeInTheDocument();
  });
});

describe("TourProvider — scroll até o alvo (plano 27, Fase 2)", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(
      () => {},
    );
  });

  afterEach(() => {
    vi.mocked(Element.prototype.scrollIntoView).mockRestore();
  });

  it("rola até o alvo, centralizado, ao abrir um passo com alvo", async () => {
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(await screen.findByRole("button", { name: "Começar" }));
    await screen.findByRole("dialog", { name: "Seu saldo" });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" }),
    );
  });

  it("não rola no passo do convite (sem alvo)", async () => {
    render(<TestApp />);

    await screen.findByRole("dialog", { name: "Bem-vindo ao VLR Fantasy" });

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("alvo mais alto que a viewport: rola alinhando ao topo", async () => {
    const user = userEvent.setup();
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      width: 300,
      // window.innerHeight em jsdom é 768 por padrão — bem acima de 80% disso.
      height: 700,
      right: 300,
      bottom: 700,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    render(<TestApp />);

    await user.click(await screen.findByRole("button", { name: "Começar" }));
    await screen.findByRole("dialog", { name: "Seu saldo" });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
  });
});

describe("TourProvider — alvo ausente (Decisão 4, plano 25)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // `waitFor`/`findBy*` fazem polling com timers de verdade — sob
  // `vi.useFakeTimers()`, isso nunca resolve sozinho. Por isso estes testes
  // usam `fireEvent` (síncrono) + `act` (esvazia a fila de microtasks) em vez
  // de `userEvent`/`waitFor`, e avançam o relógio explicitamente com
  // `vi.advanceTimersByTimeAsync`.
  it("alvo que nunca aparece: segura no passo anterior e depois abre centralizado, sem travar", async () => {
    render(<TestApp omit={["saldo"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Começar" }));
    await act(async () => {});

    // Ainda no convite — "saldo" nunca aparece no DOM.
    expect(
      screen.getByRole("dialog", { name: "Bem-vindo ao VLR Fantasy" }),
    ).toBeInTheDocument();
    expect(advanceButton()).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(
      screen.getByRole("dialog", { name: "Seu saldo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Créditos para contratar. Quem joga bem valoriza; quem joga mal desvaloriza e derrete seu patrimônio.",
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

    // Segura em "Próximos jogos" enquanto espera o alvo do fechamento.
    expect(
      screen.getByRole("dialog", { name: "Próximos jogos" }),
    ).toBeInTheDocument();
    expect(advanceButton()).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(
      screen.getByRole("dialog", { name: "Fique de olho no fechamento" }),
    ).toBeInTheDocument();
    // O reserva (`proximos-jogos`) existe: o recorte tem um polígono de verdade.
    expect(container.querySelector("polygon")).not.toBeNull();
  });
});

describe("TourProvider — watchdog de navegação (plano 27, Fase 3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pathname que nunca muda: após 8s o passo novo aparece centralizado, sem travar", async () => {
    const { container } = render(<TestApp />);

    fireEvent.click(screen.getByRole("button", { name: "Começar" })); // → saldo
    await act(async () => {});
    // saldo → região → próximos jogos → fechamento → desempenho
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
      await act(async () => {});
    }
    expect(
      screen.getByRole("dialog", { name: "Seus pontos" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Próximo" })); // → /my-team
    await act(async () => {});

    expect(pushMock).toHaveBeenCalledWith("/my-team");
    // Segura em "Seus pontos" — nunca chamamos `commitNavigation`.
    expect(
      screen.getByRole("dialog", { name: "Seus pontos" }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    // O watchdog publica o passo mesmo sem a rota ter comitado — centralizado.
    expect(
      screen.getByRole("dialog", { name: "Sua escalação" }),
    ).toBeInTheDocument();
    expect(container.querySelector("polygon")).toBeNull();
  });
});
