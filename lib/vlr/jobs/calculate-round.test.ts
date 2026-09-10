// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  refreshRoundMatchCountsMock,
  getActiveRoundMock,
  closeActiveRoundMock,
  dbSelectMock,
  dbTransactionMock,
} = vi.hoisted(() => ({
  refreshRoundMatchCountsMock: vi.fn(),
  getActiveRoundMock: vi.fn(),
  closeActiveRoundMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbTransactionMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: dbSelectMock, transaction: dbTransactionMock },
  pool: { end: vi.fn() },
}));
vi.mock("@/db/close-round", () => ({ closeActiveRound: closeActiveRoundMock }));
vi.mock("@/lib/team/queries", () => ({ getActiveRound: getActiveRoundMock }));
vi.mock("@/lib/vlr/persist/rounds", () => ({
  refreshRoundMatchCounts: refreshRoundMatchCountsMock,
}));

import { player as playerTable } from "@/db/schema";
import { calculateRound, runRoundJob } from "@/lib/vlr/jobs/calculate-round";

type Call = { op: string; payload: unknown; scoped: boolean };

const ROUND_ID = "round-1";

function createTxStub(rows: { playerId: string; points: number }[]) {
  const calls: Call[] = [];

  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    groupBy: () => Promise.resolve(rows),
  };

  const tx = {
    select: () => selectChain,
    update: (table: unknown) => ({
      set: (values: unknown) => {
        const op = `update:${table === playerTable ? "player" : "?"}`;
        const record = (scoped: boolean) =>
          calls.push({ op, payload: values, scoped });

        // Um **thenable**, não uma `Promise` nativa: `await` de uma promise
        // nativa ignora um `then` reatribuído (a spec devolve a própria
        // promise), e o `update().set()` sem `where` — o "zera todo mundo" —
        // passaria despercebido pelo stub.
        return {
          where: () => {
            record(true);
            return Promise.resolve();
          },
          then: (
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown,
          ) => {
            record(false);
            return Promise.resolve().then(resolve, reject);
          },
        };
      },
    }),
  };

  return { tx, calls };
}

/** `db.select().from().where()` devolvendo a contagem de pendentes/total. */
function mockCounts(total: number, pending: number) {
  dbSelectMock.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve([{ total, pending }]),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshRoundMatchCountsMock.mockResolvedValue({
    totalMatches: 1,
    scoredMatches: 1,
  });
});

describe("calculateRound", () => {
  it("ATRIBUI a soma a player.score — nunca soma ao valor que já estava lá", async () => {
    const { tx, calls } = createTxStub([{ playerId: "p1", points: 89.5 }]);

    const result = await calculateRound(tx as never, ROUND_ID);

    expect(result).toEqual({ scoredPlayers: 1, totalPoints: 89.5 });
    const scoped = calls.filter((call) => call.scoped);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].payload).toEqual({ score: 89.5 });
  });

  it("zera todo mundo antes: quem não jogou a rodada volta a 0", async () => {
    const { tx, calls } = createTxStub([{ playerId: "p1", points: 10 }]);

    await calculateRound(tx as never, ROUND_ID);

    // O update sem `where` (todo o catálogo) vem primeiro.
    expect(calls[0]).toMatchObject({ scoped: false, payload: { score: 0 } });
  });

  it("arredonda para uma casa decimal — o que `numeric(6,1)` aceita", async () => {
    const { tx, calls } = createTxStub([{ playerId: "p1", points: 27.449999 }]);

    await calculateRound(tx as never, ROUND_ID);

    expect(calls.find((call) => call.scoped)!.payload).toEqual({ score: 27.4 });
  });

  it("uma rodada sem estatística nenhuma zera o catálogo e não quebra", async () => {
    const { tx, calls } = createTxStub([]);

    const result = await calculateRound(tx as never, ROUND_ID);

    expect(result).toEqual({ scoredPlayers: 0, totalPoints: 0 });
    expect(calls.filter((call) => call.scoped)).toHaveLength(0);
  });

  it("recontabiliza as partidas pontuadas da rodada — as colunas que a UI lê", async () => {
    const { tx } = createTxStub([{ playerId: "p1", points: 10 }]);

    await calculateRound(tx as never, ROUND_ID);

    expect(refreshRoundMatchCountsMock).toHaveBeenCalledWith(tx, ROUND_ID);
  });
});

describe("runRoundJob", () => {
  it("sem rodada ativa: não faz nada", async () => {
    getActiveRoundMock.mockResolvedValue(null);

    const result = await runRoundJob();

    expect(result).toEqual({ status: "no-active-round" });
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("com partida pendente: espera, não fecha", async () => {
    getActiveRoundMock.mockResolvedValue({ id: ROUND_ID });
    mockCounts(2, 1);

    const result = await runRoundJob();

    expect(result).toEqual({ status: "waiting", pending: 1 });
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("nenhuma partida na rodada: espera", async () => {
    getActiveRoundMock.mockResolvedValue({ id: ROUND_ID });
    mockCounts(0, 0);

    const result = await runRoundJob();

    expect(result).toEqual({ status: "waiting", pending: 0 });
  });

  it("rodada com uma partida descartada e o resto extraída: fecha — a descartada não conta como pendente", async () => {
    // A contagem já sai filtrada do banco (`isNull(match.dismissedAt)`, Fase 3
    // do plano 17): sem esse filtro, uma partida cancelada nunca teria
    // `scrapedAt` e `pending` nunca chegaria a 0 — a rodada travaria para
    // sempre (fato 6 do Context).
    getActiveRoundMock.mockResolvedValue({ id: ROUND_ID });
    mockCounts(1, 0);
    const { tx } = createTxStub([]);
    dbTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(tx),
    );
    closeActiveRoundMock.mockResolvedValue({ closedRoundId: ROUND_ID });

    const result = await runRoundJob();

    expect(result.status).toBe("closed");
    expect(closeActiveRoundMock).toHaveBeenCalledWith(tx);
  });
});
