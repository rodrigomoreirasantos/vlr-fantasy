// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { organizationLeagueMock } = vi.hoisted(() => ({
  organizationLeagueMock: vi.fn(),
}));

vi.mock("@/lib/round/queries", () => ({
  organizationLeague: organizationLeagueMock,
}));

// `inArray` real vira uma árvore SQL opaca do drizzle — trocado aqui por um
// marcador introspectável, para o stub de `.where()` conseguir afirmar quais
// ids cada UPDATE alvejou sem precisar de um Postgres de verdade.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    inArray: (_column: unknown, values: readonly string[]) => ({
      __kind: "inArray" as const,
      values,
    }),
  };
});

import { applyMatchPlayerRegions } from "@/lib/vlr/persist/player-regions";

type Row = { id: string; regionSourceAt: Date | null };
type Condition = { __kind: "inArray"; values: readonly string[] };
type UpdateCall = { set: Record<string, unknown>; ids: string[] };

function createTxStub(rows: readonly Row[]) {
  const updateCalls: UpdateCall[] = [];

  const tx = {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(rows) }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: Condition) => {
          updateCalls.push({ set: values, ids: [...condition.values] });
          return Promise.resolve(undefined);
        },
      }),
    }),
  };

  return { tx, updateCalls };
}

const SOURCE_LEAGUE = {
  event: "VCT 2026: Americas Stage 2",
  regionCode: null,
  scheduledAt: new Date("2026-06-01T00:00:00Z"),
};

const SOURCE_INTERNATIONAL = {
  event: "Valorant Champions 2026",
  regionCode: null,
  scheduledAt: new Date("2026-08-01T00:00:00Z"),
};

beforeEach(() => {
  organizationLeagueMock.mockReset();
});

describe("applyMatchPlayerRegions — evento de liga", () => {
  it("atualiza quem nunca teve região resolvida", async () => {
    const { tx, updateCalls } = createTxStub([
      { id: "p1", regionSourceAt: null },
    ]);

    const result = await applyMatchPlayerRegions(tx as never, {
      source: SOURCE_LEAGUE,
      playersByOrganization: new Map([["LOUD", ["p1"]]]),
    });

    expect(result.updated).toBe(1);
    expect(updateCalls).toEqual([
      {
        set: { region: "americas", regionSourceAt: SOURCE_LEAGUE.scheduledAt },
        ids: ["p1"],
      },
    ]);
  });

  it("atualiza quem tinha uma fonte mais antiga — guard '<='", async () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const { tx, updateCalls } = createTxStub([
      { id: "p1", regionSourceAt: older },
    ]);

    await applyMatchPlayerRegions(tx as never, {
      source: SOURCE_LEAGUE,
      playersByOrganization: new Map([["LOUD", ["p1"]]]),
    });

    expect(updateCalls).toHaveLength(1);
  });

  it("o mesmo instante ainda atualiza — idempotente no re-scrape do mesmo HTML", async () => {
    const { tx, updateCalls } = createTxStub([
      { id: "p1", regionSourceAt: SOURCE_LEAGUE.scheduledAt },
    ]);

    await applyMatchPlayerRegions(tx as never, {
      source: SOURCE_LEAGUE,
      playersByOrganization: new Map([["LOUD", ["p1"]]]),
    });

    expect(updateCalls).toHaveLength(1);
  });

  it("não regride quem já tem uma fonte mais recente", async () => {
    const newer = new Date("2026-07-01T00:00:00Z");
    const { tx, updateCalls } = createTxStub([
      { id: "p1", regionSourceAt: newer },
    ]);

    const result = await applyMatchPlayerRegions(tx as never, {
      source: SOURCE_LEAGUE,
      playersByOrganization: new Map([["LOUD", ["p1"]]]),
    });

    expect(result.updated).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("mistura elegíveis e não elegíveis no mesmo lote", async () => {
    const { tx, updateCalls } = createTxStub([
      { id: "eligible", regionSourceAt: null },
      { id: "blocked", regionSourceAt: new Date("2026-07-01T00:00:00Z") },
    ]);

    const result = await applyMatchPlayerRegions(tx as never, {
      source: SOURCE_LEAGUE,
      playersByOrganization: new Map([["LOUD", ["eligible", "blocked"]]]),
    });

    expect(result.updated).toBe(1);
    expect(updateCalls[0]?.ids).toEqual(["eligible"]);
  });
});

describe("applyMatchPlayerRegions — evento internacional ou desconhecido", () => {
  it("nunca escreve sobre quem já tem região resolvida", async () => {
    const { tx, updateCalls } = createTxStub([
      { id: "p1", regionSourceAt: new Date("2026-01-01T00:00:00Z") },
    ]);

    const result = await applyMatchPlayerRegions(tx as never, {
      source: SOURCE_INTERNATIONAL,
      playersByOrganization: new Map([["LOUD", ["p1"]]]),
    });

    expect(result.updated).toBe(0);
    expect(organizationLeagueMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("resolve o provisório emprestando a liga da organização", async () => {
    organizationLeagueMock.mockResolvedValue("americas");
    const { tx, updateCalls } = createTxStub([
      { id: "p1", regionSourceAt: null },
    ]);

    const result = await applyMatchPlayerRegions(tx as never, {
      source: SOURCE_INTERNATIONAL,
      playersByOrganization: new Map([["LOUD", ["p1"]]]),
    });

    expect(result.updated).toBe(1);
    expect(organizationLeagueMock).toHaveBeenCalledWith("LOUD", tx);
    expect(updateCalls).toEqual([{ set: { region: "americas" }, ids: ["p1"] }]);
  });

  it("sem liga conhecida para a organização, não escreve nada", async () => {
    organizationLeagueMock.mockResolvedValue(null);
    const { tx, updateCalls } = createTxStub([
      { id: "p1", regionSourceAt: null },
    ]);

    const result = await applyMatchPlayerRegions(tx as never, {
      source: SOURCE_INTERNATIONAL,
      playersByOrganization: new Map([["LOUD", ["p1"]]]),
    });

    expect(result.updated).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });
});

describe("applyMatchPlayerRegions — sem jogadores", () => {
  it("lista vazia não consulta nada", async () => {
    const { tx, updateCalls } = createTxStub([]);

    const result = await applyMatchPlayerRegions(tx as never, {
      source: SOURCE_LEAGUE,
      playersByOrganization: new Map(),
    });

    expect(result.updated).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });
});
