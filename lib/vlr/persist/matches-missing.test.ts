// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// `eq` real vira árvore SQL opaca do drizzle — trocado por um marcador
// introspectável (mesmo truque de `events-tracking.test.ts`), para o stub de
// `.where()` conseguir afirmar qual partida cada UPDATE alvejou. `gte`/`lte`
// continuam reais, mas espionados: `and()` (real) exige objetos SQL de
// verdade, então um marcador plano quebraria a composição da query.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (_col: unknown, value: unknown) => ({ __kind: "eq" as const, value }),
    gte: vi.fn(actual.gte),
    lte: vi.fn(actual.lte),
  };
});

import { markMissingMatches } from "@/lib/vlr/persist/matches";

type Candidate = {
  id: string;
  vlrId: string | null;
  missingSince: Date | null;
  dismissedAt: Date | null;
};

function row(overrides: Partial<Candidate> & { id: string }): Candidate {
  return {
    vlrId: overrides.id,
    missingSince: null,
    dismissedAt: null,
    ...overrides,
  };
}

function createTxStub(candidates: Candidate[]) {
  const updateCalls: { id: string; values: Record<string, unknown> }[] = [];
  let whereArgs: unknown;

  const tx = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: (args: unknown) => {
            whereArgs = args;
            return Promise.resolve(candidates);
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: { value: string }) => {
          updateCalls.push({ id: condition.value, values });
          return Promise.resolve(undefined);
        },
      }),
    }),
  };

  return { tx, updateCalls, whereArgsOf: () => whereArgs };
}

const SWEPT_AT = new Date("2026-09-10T12:00:00Z");
const HORIZON_AT = new Date("2026-09-20T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markMissingMatches", () => {
  it("1ª ausência: grava missingSince e não descarta ainda", async () => {
    const { tx, updateCalls } = createTxStub([row({ id: "m1" })]);

    const result = await markMissingMatches(tx as never, {
      seenVlrIds: [],
      horizonAt: HORIZON_AT,
      sweptAt: SWEPT_AT,
    });

    expect(result).toEqual({ flagged: 1, dismissed: 0, restored: 0 });
    expect(updateCalls).toEqual([
      { id: "m1", values: { missingSince: SWEPT_AT } },
    ]);
  });

  it("2ª ausência seguida: descarta (dismissedAt)", async () => {
    const previousSweep = new Date(SWEPT_AT.getTime() - 60 * 60_000);
    const { tx, updateCalls } = createTxStub([
      row({ id: "m1", missingSince: previousSweep }),
    ]);

    const result = await markMissingMatches(tx as never, {
      seenVlrIds: [],
      horizonAt: HORIZON_AT,
      sweptAt: SWEPT_AT,
    });

    expect(result).toEqual({ flagged: 0, dismissed: 1, restored: 0 });
    expect(updateCalls).toEqual([
      { id: "m1", values: { dismissedAt: SWEPT_AT } },
    ]);
  });

  it("card visto de novo ressuscita: volta missingSince e dismissedAt a null", async () => {
    const previousSweep = new Date(SWEPT_AT.getTime() - 60 * 60_000);
    const { tx, updateCalls } = createTxStub([
      row({
        id: "m1",
        vlrId: "vlr-1",
        missingSince: previousSweep,
        dismissedAt: previousSweep,
      }),
    ]);

    const result = await markMissingMatches(tx as never, {
      seenVlrIds: ["vlr-1"],
      horizonAt: HORIZON_AT,
      sweptAt: SWEPT_AT,
    });

    expect(result).toEqual({ flagged: 0, dismissed: 0, restored: 1 });
    expect(updateCalls).toEqual([
      { id: "m1", values: { missingSince: null, dismissedAt: null } },
    ]);
  });

  it("card visto e nunca esteve ausente: não gera update nenhum", async () => {
    const { tx, updateCalls } = createTxStub([
      row({ id: "m1", vlrId: "vlr-1" }),
    ]);

    const result = await markMissingMatches(tx as never, {
      seenVlrIds: ["vlr-1"],
      horizonAt: HORIZON_AT,
      sweptAt: SWEPT_AT,
    });

    expect(result).toEqual({ flagged: 0, dismissed: 0, restored: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it("já descartada e ainda ausente: não atualiza de novo", async () => {
    const previousSweep = new Date(SWEPT_AT.getTime() - 60 * 60_000);
    const { tx, updateCalls } = createTxStub([
      row({
        id: "m1",
        missingSince: previousSweep,
        dismissedAt: previousSweep,
      }),
    ]);

    const result = await markMissingMatches(tx as never, {
      seenVlrIds: [],
      horizonAt: HORIZON_AT,
      sweptAt: SWEPT_AT,
    });

    expect(result).toEqual({ flagged: 0, dismissed: 0, restored: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it("consulta com gte(sweptAt) e lte(horizonAt) — nunca toca partida além do horizonte varrido", async () => {
    const { gte, lte } = await import("drizzle-orm");
    const { tx } = createTxStub([]);

    await markMissingMatches(tx as never, {
      seenVlrIds: [],
      horizonAt: HORIZON_AT,
      sweptAt: SWEPT_AT,
    });

    expect(gte).toHaveBeenCalledWith(expect.anything(), SWEPT_AT);
    expect(lte).toHaveBeenCalledWith(expect.anything(), HORIZON_AT);
  });
});
