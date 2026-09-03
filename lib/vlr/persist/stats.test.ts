// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, pool: { end: vi.fn() } }));

import { match as matchTable, playerMatchStat } from "@/db/schema";
import { saveMatchStats, type MatchStatRow } from "@/lib/vlr/persist/stats";

type Call = { op: string; payload: unknown; conflict?: unknown };

const ROW: MatchStatRow = {
  playerId: "player-1",
  mapName: "Ascent",
  gameVlrId: "278704",
  agent: "Neon",
  rating: 1.06,
  acs: 221,
  kills: 17,
  deaths: 14,
  assists: 3,
  kast: 67,
  adr: 132,
  headshotPct: 19,
  firstKills: 5,
  firstDeaths: 3,
  won: false,
  fantasyPoints: 24.5,
  scoutVersion: 1,
};

const ARGS = {
  matchId: "match-1",
  rows: [ROW],
  rawHtmlPath: "storage/raw/match/724899/2026-09-03.html.gz",
  scrapedAt: new Date("2026-09-03T12:00:00Z"),
  scoreA: 1,
  scoreB: 2,
  bestOf: 3,
  status: "finished" as const,
};

function createTxStub() {
  const calls: Call[] = [];
  const tx = {
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        onConflictDoUpdate: (config: { target: unknown }) => {
          calls.push({
            op: `insert:${table === playerMatchStat ? "player_match_stat" : "?"}`,
            payload: values,
            conflict: config.target,
          });
          return Promise.resolve();
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          calls.push({
            op: `update:${table === matchTable ? "match" : "?"}`,
            payload: values,
          });
          return Promise.resolve();
        },
      }),
    }),
  };
  return { tx, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveMatchStats", () => {
  it("faz upsert na tripla (partida, jogador, mapa do vlr)", async () => {
    const { tx, calls } = createTxStub();

    await saveMatchStats(tx as never, ARGS);

    const insert = calls.find(
      (call) => call.op === "insert:player_match_stat",
    )!;
    // Por `gameVlrId`, não por `mapName`: a mesma série pode repetir o nome
    // do mapa, e aí o `ON CONFLICT DO UPDATE` estouraria com "cannot affect
    // row a second time", derrubando a transação inteira.
    expect(insert.conflict).toEqual([
      playerMatchStat.matchId,
      playerMatchStat.playerId,
      playerMatchStat.gameVlrId,
    ]);
    expect(insert.payload).toEqual([{ ...ROW, matchId: "match-1" }]);
  });

  it("grava `scrapedAt` e o caminho do HTML na MESMA transação das estatísticas", async () => {
    const { tx, calls } = createTxStub();

    await saveMatchStats(tx as never, ARGS);

    expect(calls.map((call) => call.op)).toEqual([
      "insert:player_match_stat",
      "update:match",
    ]);
    expect(calls[1].payload).toEqual({
      scrapedAt: ARGS.scrapedAt,
      rawHtmlPath: ARGS.rawHtmlPath,
      status: "finished",
      scoreA: 1,
      scoreB: 2,
      bestOf: 3,
    });
  });

  it("uma partida sem linha de estatística ainda é marcada como extraída", async () => {
    const { tx, calls } = createTxStub();

    // Um walkover não tem scoreboard; sem isso a partida seria reenfileirada
    // para sempre, gastando requisições contra o vlr a cada rodada do worker.
    await saveMatchStats(tx as never, { ...ARGS, rows: [] });

    expect(calls.map((call) => call.op)).toEqual(["update:match"]);
  });
});

describe("saveMatchStats — partida não encerrada", () => {
  it("NÃO grava `scrapedAt` para uma série ainda em andamento", async () => {
    const { tx, calls } = createTxStub();

    // A regra de cache permanente é `WHERE scraped_at IS NULL`: marcar uma
    // partida ao vivo a congelaria com o scoreboard pela metade, para sempre.
    await saveMatchStats(tx as never, { ...ARGS, status: "live" });

    const update = calls.find((call) => call.op === "update:match")!;
    expect(update.payload).toMatchObject({ scrapedAt: null, status: "live" });
  });

  it("mas guarda as estatísticas parciais e o HTML — o dado não se perde", async () => {
    const { tx, calls } = createTxStub();

    await saveMatchStats(tx as never, { ...ARGS, status: "live" });

    expect(calls.map((call) => call.op)).toEqual([
      "insert:player_match_stat",
      "update:match",
    ]);
    expect(calls[1].payload).toMatchObject({ rawHtmlPath: ARGS.rawHtmlPath });
  });
});
