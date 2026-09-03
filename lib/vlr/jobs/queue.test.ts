// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, pool: { end: vi.fn() } }));

import {
  MAX_ATTEMPTS,
  claim,
  complete,
  enqueue,
  fail,
} from "@/lib/vlr/jobs/queue";
import { VLR_JOBS } from "@/lib/vlr/jobs/types";

type Call = { op: string; payload: unknown };

const NOW = new Date("2026-09-03T12:00:00Z");

function createTxStub(candidate?: { id: string } | null) {
  const calls: Call[] = [];

  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    orderBy: () => selectChain,
    limit: () => selectChain,
    for: (mode: string, opts?: { skipLocked?: boolean }) => {
      calls.push({ op: "select:for", payload: { mode, ...opts } });
      return Promise.resolve(candidate ? [candidate] : []);
    },
  };

  const tx = {
    select: () => selectChain,
    insert: () => ({
      values: (values: unknown) => ({
        onConflictDoUpdate: (config: unknown) => ({
          returning: async () => {
            calls.push({
              op: "insert:vlr_job_run",
              payload: { values, config },
            });
            return Array.isArray(values) ? values.map(() => ({ id: "x" })) : [];
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: () => {
          const result = Promise.resolve() as Promise<unknown> & {
            returning: () => Promise<unknown[]>;
          };
          calls.push({ op: "update:vlr_job_run", payload: values });
          result.returning = async () => [
            {
              id: "job-1",
              job: VLR_JOBS.scrapeMatch,
              key: "724899",
              attempts: 1,
            },
          ];
          return result;
        },
      }),
    }),
  };

  return { tx, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueue", () => {
  it("não escreve nada para uma lista vazia", async () => {
    const { tx, calls } = createTxStub();
    await expect(enqueue(tx as never, VLR_JOBS.scrapeMatch, [])).resolves.toBe(
      0,
    );
    expect(calls).toEqual([]);
  });

  it("deduplica as chaves antes de enfileirar", async () => {
    const { tx, calls } = createTxStub();

    await enqueue(tx as never, VLR_JOBS.scrapeMatch, ["1", "1", "2"]);

    const payload = calls[0].payload as { values: unknown[] };
    expect(payload.values).toEqual([
      { job: VLR_JOBS.scrapeMatch, key: "1" },
      { job: VLR_JOBS.scrapeMatch, key: "2" },
    ]);
  });

  it("uma linha já `running` não é reenfileirada: já tem dono", async () => {
    const { tx, calls } = createTxStub();

    await enqueue(tx as never, VLR_JOBS.scrapeMatch, ["724899"]);

    const { config } = calls[0].payload as { config: { where?: unknown } };
    expect(config.where).toBeDefined();
  });
});

describe("claim", () => {
  it("reivindica com FOR UPDATE SKIP LOCKED — dois workers não pegam a mesma partida", async () => {
    const { tx, calls } = createTxStub({ id: "job-1" });

    const claimed = await claim(tx as never, VLR_JOBS.scrapeMatch, NOW);

    expect(calls[0]).toEqual({
      op: "select:for",
      payload: { mode: "update", skipLocked: true },
    });
    expect(claimed).toMatchObject({ id: "job-1", key: "724899" });
  });

  it("marca `running` e incrementa as tentativas na mesma transação", async () => {
    const { tx, calls } = createTxStub({ id: "job-1" });

    await claim(tx as never, VLR_JOBS.scrapeMatch, NOW);

    const update = calls.find((call) => call.op === "update:vlr_job_run")!;
    expect(update.payload).toMatchObject({ status: "running", startedAt: NOW });
  });

  it("fila vazia devolve null sem escrever nada", async () => {
    const { tx, calls } = createTxStub(null);

    await expect(
      claim(tx as never, VLR_JOBS.scrapeMatch, NOW),
    ).resolves.toBeNull();
    expect(calls.some((call) => call.op === "update:vlr_job_run")).toBe(false);
  });
});

describe("fail", () => {
  it("reagenda com backoff exponencial enquanto restam tentativas", async () => {
    const { tx, calls } = createTxStub();

    await fail(
      tx as never,
      { id: "job-1", attempts: 1, error: "timeout" },
      NOW,
    );

    const payload = calls[0].payload as { status: string; runAfter: Date };
    expect(payload.status).toBe("pending");
    expect(payload.runAfter.getTime() - NOW.getTime()).toBe(2 * 60_000);
  });

  it("o backoff dobra a cada tentativa", async () => {
    const { tx, calls } = createTxStub();

    await fail(
      tx as never,
      { id: "job-1", attempts: 2, error: "timeout" },
      NOW,
    );

    const payload = calls[0].payload as { runAfter: Date };
    expect(payload.runAfter.getTime() - NOW.getTime()).toBe(4 * 60_000);
  });

  it("na última tentativa vai para a dead letter queue", async () => {
    const { tx, calls } = createTxStub();

    await fail(
      tx as never,
      { id: "job-1", attempts: MAX_ATTEMPTS, error: "seletor quebrado" },
      NOW,
    );

    expect(calls[0].payload).toMatchObject({ status: "dead", finishedAt: NOW });
  });

  it("um erro gigantesco é truncado — a coluna não é um depósito de stack trace", async () => {
    const { tx, calls } = createTxStub();

    await fail(
      tx as never,
      { id: "job-1", attempts: 1, error: "x".repeat(5_000) },
      NOW,
    );

    const payload = calls[0].payload as { lastError: string };
    expect(payload.lastError).toHaveLength(2_000);
  });
});

describe("complete", () => {
  it("marca `done` e limpa o último erro", async () => {
    const { tx, calls } = createTxStub();

    await complete(tx as never, "job-1", NOW);

    expect(calls[0].payload).toEqual({
      status: "done",
      finishedAt: NOW,
      lastError: null,
      updatedAt: NOW,
    });
  });
});
