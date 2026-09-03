// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, pool: { end: vi.fn() } }));

import { match as matchTable, round as roundTable } from "@/db/schema";
import { syncRoundsFromMatches } from "@/lib/vlr/persist/rounds";

type Call = { op: string; payload: unknown };

/** Semana ISO 2026-W36 (31/08 a 06/09). */
const FIRST_KICKOFF = new Date("2026-09-02T21:00:00Z");
const LATER_KICKOFF = new Date("2026-09-04T18:00:00Z");
/** Semana seguinte (2026-W37). */
const NEXT_WEEK_KICKOFF = new Date("2026-09-09T18:00:00Z");

type MatchRow = { id: string; scheduledAt: Date; scrapedAt: Date | null };
type RoundRow = {
  id: string;
  number: number;
  weekKey: string | null;
  status: string;
};

function createTxStub(matches: MatchRow[], rounds: RoundRow[]) {
  const calls: Call[] = [];
  let selectCall = 0;

  const tx = {
    select: (columns?: unknown) => {
      const isRoundSelect = columns === undefined;
      return {
        from: (table: unknown) => {
          if (isRoundSelect && table === roundTable) {
            return Promise.resolve(rounds);
          }
          selectCall += 1;
          return {
            innerJoin: () => ({
              where: () => Promise.resolve(matches),
            }),
            where: () => Promise.resolve(matches),
          };
        },
      };
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        returning: async () => {
          calls.push({ op: `insert:${tableName(table)}`, payload: values });
          return [{ id: `round-new-${calls.length}` }];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          calls.push({ op: `update:${tableName(table)}`, payload: values });
          return Promise.resolve();
        },
      }),
    }),
  };

  function tableName(table: unknown): string {
    if (table === roundTable) return "round";
    if (table === matchTable) return "match";
    return "unknown";
  }

  return { tx, calls, selectCalls: () => selectCall };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncRoundsFromMatches", () => {
  it("sem partida de evento tracked, não escreve nada", async () => {
    const { tx, calls } = createTxStub([], []);
    await expect(syncRoundsFromMatches(tx as never)).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it("cria a rodada da semana com marketClosesAt no kickoff do PRIMEIRO jogo", async () => {
    const { tx, calls } = createTxStub(
      [
        { id: "m2", scheduledAt: LATER_KICKOFF, scrapedAt: null },
        { id: "m1", scheduledAt: FIRST_KICKOFF, scrapedAt: null },
      ],
      [],
    );

    const [synced] = await syncRoundsFromMatches(tx as never);

    // A regra inviolável nº 8: a escalação trava quando a rodada começa.
    expect(synced.marketClosesAt).toEqual(FIRST_KICKOFF);
    expect(synced.weekKey).toBe("2026-W36");

    const insert = calls.find((call) => call.op === "insert:round")!;
    expect(insert.payload).toMatchObject({
      weekKey: "2026-W36",
      marketClosesAt: FIRST_KICKOFF,
      status: "upcoming",
      totalMatches: 2,
      scoredMatches: 0,
    });
  });

  it("a rodada nasce upcoming — quem promove a active continua sendo closeActiveRound", async () => {
    const { tx, calls } = createTxStub(
      [{ id: "m1", scheduledAt: FIRST_KICKOFF, scrapedAt: null }],
      [],
    );

    await syncRoundsFromMatches(tx as never);

    const insert = calls.find((call) => call.op === "insert:round")!;
    expect(insert.payload).toMatchObject({ status: "upcoming" });
  });

  it("a janela de mercado é válida: abre antes de fechar (CHECK do banco)", async () => {
    const { tx, calls } = createTxStub(
      // Kickoff na própria segunda 00:00 UTC — o caso degenerado.
      [
        {
          id: "m1",
          scheduledAt: new Date("2026-08-31T00:00:00Z"),
          scrapedAt: null,
        },
      ],
      [],
    );

    await syncRoundsFromMatches(tx as never);

    const payload = calls.find((call) => call.op === "insert:round")!
      .payload as { marketOpensAt: Date; marketClosesAt: Date };
    expect(payload.marketOpensAt.getTime()).toBeLessThan(
      payload.marketClosesAt.getTime(),
    );
  });

  it("é idempotente: com a rodada já existente, atualiza em vez de criar outra", async () => {
    const { tx, calls } = createTxStub(
      [{ id: "m1", scheduledAt: FIRST_KICKOFF, scrapedAt: new Date() }],
      [{ id: "round-1", number: 1, weekKey: "2026-W36", status: "upcoming" }],
    );

    const [synced] = await syncRoundsFromMatches(tx as never);

    expect(synced.created).toBe(false);
    expect(synced.roundId).toBe("round-1");
    expect(calls.some((call) => call.op === "insert:round")).toBe(false);
    expect(calls[0]).toMatchObject({
      op: "update:round",
      payload: { marketClosesAt: FIRST_KICKOFF, scoredMatches: 1 },
    });
  });

  it("numa rodada já em andamento, só recontabiliza — não mexe na janela de mercado", async () => {
    const { tx, calls } = createTxStub(
      [{ id: "m1", scheduledAt: FIRST_KICKOFF, scrapedAt: null }],
      [{ id: "round-1", number: 1, weekKey: "2026-W36", status: "active" }],
    );

    await syncRoundsFromMatches(tx as never);

    const payload = calls.find((call) => call.op === "update:round")!.payload;
    expect(payload).toEqual({ totalMatches: 1, scoredMatches: 0 });
  });

  it("numera as rodadas novas em sequência, na ordem cronológica das semanas", async () => {
    const { tx, calls } = createTxStub(
      [
        { id: "m2", scheduledAt: NEXT_WEEK_KICKOFF, scrapedAt: null },
        { id: "m1", scheduledAt: FIRST_KICKOFF, scrapedAt: null },
      ],
      [{ id: "round-old", number: 7, weekKey: null, status: "finished" }],
    );

    const synced = await syncRoundsFromMatches(tx as never);

    expect(synced.map((row) => row.weekKey)).toEqual(["2026-W36", "2026-W37"]);
    const inserts = calls.filter((call) => call.op === "insert:round");
    expect(
      inserts.map((call) => (call.payload as { number: number }).number),
    ).toEqual([8, 9]);
  });

  it("liga as partidas da semana à sua rodada", async () => {
    const { tx, calls } = createTxStub(
      [{ id: "m1", scheduledAt: FIRST_KICKOFF, scrapedAt: null }],
      [],
    );

    await syncRoundsFromMatches(tx as never);

    expect(calls.some((call) => call.op === "update:match")).toBe(true);
  });
});

describe("syncRoundsFromMatches — semanas que já passaram", () => {
  it("uma semana anterior à corrente nasce `finished`, nunca entra na rotação", async () => {
    const { tx, calls } = createTxStub(
      [{ id: "m1", scheduledAt: FIRST_KICKOFF, scrapedAt: new Date() }],
      [],
    );

    // O backfill descobre semanas antigas depois de rodadas futuras já
    // existirem; sem isso `closeActiveRound` promoveria uma rodada de agosto
    // depois de uma de setembro, porque `number` sai na ordem de descoberta.
    await syncRoundsFromMatches(tx as never, new Date("2026-09-20T12:00:00Z"));

    expect(
      calls.find((call) => call.op === "insert:round")!.payload,
    ).toMatchObject({
      weekKey: "2026-W36",
      status: "finished",
    });
  });

  it("a semana corrente ainda nasce `upcoming`", async () => {
    const { tx, calls } = createTxStub(
      [{ id: "m1", scheduledAt: FIRST_KICKOFF, scrapedAt: null }],
      [],
    );

    await syncRoundsFromMatches(tx as never, new Date("2026-09-03T12:00:00Z"));

    expect(
      calls.find((call) => call.op === "insert:round")!.payload,
    ).toMatchObject({
      status: "upcoming",
    });
  });
});
