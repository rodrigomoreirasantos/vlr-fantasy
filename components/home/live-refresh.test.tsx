import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveRefresh } from "@/components/home/live-refresh";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

/** Finge a aba escondida/à vista e avisa o documento, como o navegador faria. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("LiveRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("não desenha nada — é só o relógio da tela", () => {
    const { container } = render(<LiveRefresh intervalMs={60_000} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("atualiza os dados a cada intervalo, sem atualizar de saída", () => {
    render(<LiveRefresh intervalMs={60_000} />);

    expect(refresh).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(120_000));

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("aba escondida não gasta consulta nenhuma", () => {
    render(<LiveRefresh intervalMs={60_000} />);

    act(() => setVisibility("hidden"));
    act(() => void vi.advanceTimersByTime(300_000));

    expect(refresh).not.toHaveBeenCalled();
  });

  it("ao voltar para a aba, atualiza na hora e retoma o ciclo", () => {
    render(<LiveRefresh intervalMs={60_000} />);

    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));

    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => void vi.advanceTimersByTime(60_000));

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("desmontar para o relógio", () => {
    const { unmount } = render(<LiveRefresh intervalMs={60_000} />);

    unmount();
    act(() => void vi.advanceTimersByTime(300_000));

    expect(refresh).not.toHaveBeenCalled();
  });
});
