// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// `eq` real vira árvore SQL opaca — marcador introspectável, mesmo truque de
// outros testes deste plano.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (_col: unknown, value: unknown) => ({ __kind: "eq" as const, value }),
  };
});

import { pageChanged } from "@/lib/vlr/persist/page-state";

function createTxStub(
  existing: {
    id: string;
    contentHash: string;
    unchangedRuns: number;
  } | null,
) {
  const inserted: Record<string, unknown>[] = [];
  const updated: { id: string; values: Record<string, unknown> }[] = [];

  const tx = {
    query: {
      vlrPageState: { findFirst: () => Promise.resolve(existing) },
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: { value: string }) => {
          updated.push({ id: condition.value, values });
          return Promise.resolve();
        },
      }),
    }),
  };

  return { tx, inserted, updated };
}

const AT = new Date("2026-09-10T12:00:00Z");

describe("pageChanged", () => {
  it("primeira vez que o caminho é visto: insere e devolve true", async () => {
    const { tx, inserted } = createTxStub(null);

    const result = await pageChanged(tx as never, {
      path: "/matches",
      hash: "hash-1",
      at: AT,
    });

    expect(result).toBe(true);
    expect(inserted).toEqual([
      {
        path: "/matches",
        contentHash: "hash-1",
        fetchedAt: AT,
        changedAt: AT,
        unchangedRuns: 0,
      },
    ]);
  });

  it("digital igual à última: devolve false e só incrementa unchangedRuns", async () => {
    const { tx, updated } = createTxStub({
      id: "state-1",
      contentHash: "hash-1",
      unchangedRuns: 2,
    });

    const result = await pageChanged(tx as never, {
      path: "/matches",
      hash: "hash-1",
      at: AT,
    });

    expect(result).toBe(false);
    expect(updated).toEqual([
      { id: "state-1", values: { fetchedAt: AT, unchangedRuns: 3 } },
    ]);
  });

  it("digital diferente: devolve true e reseta unchangedRuns", async () => {
    const { tx, updated } = createTxStub({
      id: "state-1",
      contentHash: "hash-old",
      unchangedRuns: 5,
    });

    const result = await pageChanged(tx as never, {
      path: "/matches",
      hash: "hash-new",
      at: AT,
    });

    expect(result).toBe(true);
    expect(updated).toEqual([
      {
        id: "state-1",
        values: {
          contentHash: "hash-new",
          fetchedAt: AT,
          changedAt: AT,
          unchangedRuns: 0,
        },
      },
    ]);
  });
});
