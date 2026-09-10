// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, updateCalls } = vi.hoisted(() => {
  const updateCalls: { id: string; values: Record<string, unknown> }[] = [];
  return { findManyMock: vi.fn(), updateCalls };
});

// `eq` real vira uma árvore SQL opaca do drizzle — trocado por um marcador
// introspectável (mesmo truque de `activate-confident-players.test.ts`), para
// o stub de `.where()` conseguir afirmar qual evento cada UPDATE alvejou.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (_column: unknown, value: unknown) => ({
      __kind: "eq" as const,
      value,
    }),
  };
});

import { applyAutoTracking } from "@/lib/vlr/persist/events";

function createTxStub() {
  return {
    query: { vlrEvent: { findMany: findManyMock } },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: { value: string }) => {
          updateCalls.push({ id: condition.value, values });
          return Promise.resolve(undefined);
        },
      }),
    }),
  };
}

function row(overrides: {
  id: string;
  vlrId?: string;
  name?: string;
  status?: string;
  trackedOverride?: boolean | null;
}) {
  return {
    id: overrides.id,
    vlrId: overrides.vlrId ?? overrides.id,
    name: overrides.name ?? "VCT 2026 Americas: Stage 2",
    status: overrides.status ?? "ongoing",
    trackedOverride:
      "trackedOverride" in overrides ? overrides.trackedOverride : null,
  };
}

beforeEach(() => {
  updateCalls.length = 0;
  findManyMock.mockReset();
});

describe("applyAutoTracking", () => {
  it("liga tracked para um evento do circuito em andamento", async () => {
    findManyMock.mockResolvedValue([row({ id: "e1", vlrId: "2776" })]);

    const result = await applyAutoTracking(createTxStub() as never);

    expect(result).toEqual({ tracked: ["2776"] });
    expect(updateCalls).toEqual([{ id: "e1", values: { tracked: true } }]);
  });

  it("não liga um evento fora do circuito (ex. Challengers)", async () => {
    findManyMock.mockResolvedValue([
      row({ id: "e2", name: "Challengers League: Brazil" }),
    ]);

    const result = await applyAutoTracking(createTxStub() as never);

    expect(result).toEqual({ tracked: [] });
    expect(updateCalls).toHaveLength(0);
  });

  it("não liga quem tem o veto humano desligado, mesmo casando com a regra", async () => {
    findManyMock.mockResolvedValue([
      row({ id: "e3", name: "VCT 2026 EMEA: Stage 2", trackedOverride: false }),
    ]);

    const result = await applyAutoTracking(createTxStub() as never);

    expect(result).toEqual({ tracked: [] });
    expect(updateCalls).toHaveLength(0);
  });

  it("não desliga evento completed já seguido — a consulta nem o traz de volta", async () => {
    // `eq(vlrEvent.tracked, false)` já exclui quem está seguido; um evento
    // completed e já tracked não aparece entre os candidatos.
    findManyMock.mockResolvedValue([]);

    const result = await applyAutoTracking(createTxStub() as never);

    expect(result).toEqual({ tracked: [] });
    expect(updateCalls).toHaveLength(0);
  });

  it("é idempotente: rodar de novo sobre quem já foi ligado não gera update", async () => {
    findManyMock.mockResolvedValueOnce([row({ id: "e1", vlrId: "2776" })]);
    await applyAutoTracking(createTxStub() as never);
    expect(updateCalls).toHaveLength(1);

    // Na segunda passada, o evento já tracked não volta da consulta.
    findManyMock.mockResolvedValueOnce([]);
    const second = await applyAutoTracking(createTxStub() as never);

    expect(second).toEqual({ tracked: [] });
    expect(updateCalls).toHaveLength(1);
  });

  it("sem candidato nenhum, não roda update", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await applyAutoTracking(createTxStub() as never);

    expect(result).toEqual({ tracked: [] });
    expect(updateCalls).toHaveLength(0);
  });
});
