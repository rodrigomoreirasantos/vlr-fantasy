import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { waitForTarget } from "@/lib/tour/wait-for-target";

function makeTarget(id: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-tour", id);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("waitForTarget", () => {
  it("resolve na hora se o elemento já existe", async () => {
    document.body.appendChild(makeTarget("saldo"));

    const found = await waitForTarget('[data-tour="saldo"]');

    expect(found).not.toBeNull();
    expect(found?.getAttribute("data-tour")).toBe("saldo");
  });

  it("resolve quando o elemento é inserido depois", async () => {
    const promise = waitForTarget('[data-tour="escalacao"]');

    // Simula a página dinâmica terminando de renderizar.
    setTimeout(() => document.body.appendChild(makeTarget("escalacao")), 10);

    const found = await promise;
    expect(found?.getAttribute("data-tour")).toBe("escalacao");
  });

  describe("com fake timers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("devolve null se o elemento nunca aparece, no timeout", async () => {
      const promise = waitForTarget('[data-tour="fechamento-mercado"]', {
        timeoutMs: 8_000,
      });

      await vi.advanceTimersByTimeAsync(8_000);

      expect(await promise).toBeNull();
    });

    it("o aborto cancela a espera e devolve null", async () => {
      const controller = new AbortController();
      const promise = waitForTarget('[data-tour="perfil"]', {
        signal: controller.signal,
      });

      controller.abort();

      expect(await promise).toBeNull();
    });
  });
});
