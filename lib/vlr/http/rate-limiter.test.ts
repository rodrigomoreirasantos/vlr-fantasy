// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { acquire, resetRateLimiter } from "@/lib/vlr/http/rate-limiter";

const INTERVAL_MS = 1_100;

describe("acquire", () => {
  beforeEach(() => {
    resetRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a primeira chamada não espera", async () => {
    const startedAt = Date.now();
    const acquired = acquire(INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(0);
    await acquired;
    expect(Date.now() - startedAt).toBe(0);
  });

  it("três chamadas concorrentes levam pelo menos 2 intervalos", async () => {
    const startedAt = Date.now();
    const finishedAt: number[] = [];

    const all = Promise.all(
      [0, 1, 2].map((index) =>
        acquire(INTERVAL_MS).then(() => {
          finishedAt[index] = Date.now();
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(3 * INTERVAL_MS);
    await all;

    expect(finishedAt[2] - startedAt).toBeGreaterThanOrEqual(2 * INTERVAL_MS);
  });

  it("as vagas saem na ordem em que foram pedidas, espaçadas pelo intervalo", async () => {
    const order: number[] = [];
    const all = Promise.all(
      [0, 1, 2].map((index) =>
        acquire(INTERVAL_MS).then(() => {
          order.push(index);
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(3 * INTERVAL_MS);
    await all;

    expect(order).toEqual([0, 1, 2]);
  });

  it("uma vaga rejeitada não trava a fila para as seguintes", async () => {
    // A asserção é registrada antes de avançar o relógio: a rejeição nasce
    // já observada, senão o Node a reporta como unhandled no tick seguinte.
    const failing = expect(
      acquire(INTERVAL_MS).then(() => {
        throw new Error("falha no consumidor");
      }),
    ).rejects.toThrow("falha no consumidor");
    const next = expect(acquire(INTERVAL_MS)).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);

    await failing;
    await next;
  });
});
