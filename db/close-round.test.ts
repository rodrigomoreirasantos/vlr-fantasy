import { beforeEach, describe, expect, it, vi } from "vitest";

// `getActiveRound` mockado como qualquer outra primitiva nomeada
// (lib/team/queries.ts) — `@/db` também, para o import de topo de
// `db/close-round.ts` não abrir uma conexão real.
const { getActiveRoundMock } = vi.hoisted(() => ({
  getActiveRoundMock: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {}, pool: { end: vi.fn() } }));
vi.mock("@/lib/team/queries", () => ({
  getActiveRound: getActiveRoundMock,
}));

import { closeActiveRound } from "@/db/close-round";
import {
  fantasyTeam as fantasyTeamTable,
  player as playerTable,
  round as roundTable,
  roundPlayerScore as roundPlayerScoreTable,
  roundRoster as roundRosterTable,
  roundTeamResult as roundTeamResultTable,
} from "@/db/schema";

const ACTIVE_ROUND = { id: "round-1", number: 1 };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Janela herdada válida: contém o "agora", então a promoção a respeita. */
const NEXT_UPCOMING_ROUND = {
  id: "round-2",
  number: 2,
  marketOpensAt: new Date(Date.now() - DAY_MS),
  marketClosesAt: new Date(Date.now() + DAY_MS),
};

const PLAYER_A = { id: "player-a", score: 10, priceCents: 10_000 };
const PLAYER_B = { id: "player-b", score: 20, priceCents: 5_000 };
// Média = 15. A: (10-15)*200 = -1000 (dentro do teto de 15% de 10000).
// B: (20-15)*200 = +1000, capado a 15% de 5000 = 750.
const PLAYER_A_NEXT_PRICE = 9_000;
const PLAYER_B_NEXT_PRICE = 5_750;

const TEAM = {
  id: "team-1",
  balanceCents: 3_000,
  slots: [
    { position: 1, playerId: PLAYER_A.id, captain: true, player: PLAYER_A },
    { position: 2, playerId: PLAYER_B.id, captain: false, player: PLAYER_B },
    { position: 3, playerId: null, captain: false, player: null },
    { position: 4, playerId: null, captain: false, player: null },
    { position: 5, playerId: null, captain: false, player: null },
  ],
};

type Call = { op: string; payload: unknown };

function tableName(table: unknown): string {
  switch (table) {
    case playerTable:
      return "player";
    case roundTable:
      return "round";
    case roundPlayerScoreTable:
      return "round_player_score";
    case roundRosterTable:
      return "round_roster";
    case roundTeamResultTable:
      return "round_team_result";
    case fantasyTeamTable:
      return "fantasy_team";
    default:
      return "unknown";
  }
}

/** Um `tx` falso: os mesmos métodos que `closeActiveRound` chama, gravando
 * cada insert/update em `calls` (na ordem em que aconteceram) para os testes
 * afirmarem o quê — e em que ordem. */
function createTxStub(opts: {
  players?: (typeof PLAYER_A)[];
  teams?: (typeof TEAM)[];
  nextUpcoming?: typeof NEXT_UPCOMING_ROUND | null;
}) {
  const players = opts.players ?? [PLAYER_A, PLAYER_B];
  const teams = opts.teams ?? [TEAM];
  // `??` trataria `null` explícito (o caso "sem upcoming") igual a
  // `undefined` (o caso "não informado") — os dois têm significados opostos
  // aqui, por isso a checagem é por `in`, não por nulidade.
  const nextUpcoming =
    "nextUpcoming" in opts ? opts.nextUpcoming : NEXT_UPCOMING_ROUND;
  const calls: Call[] = [];

  const tx = {
    select: () => ({
      from: (table: unknown) => {
        if (table !== playerTable) {
          throw new Error(`select().from() inesperado: ${tableName(table)}`);
        }
        return Promise.resolve(players);
      },
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        calls.push({ op: `insert:${tableName(table)}`, payload: values });
        const result = Promise.resolve(undefined) as Promise<unknown> & {
          returning: (cols: unknown) => Promise<{ id: string }[]>;
        };
        result.returning = async () => {
          calls.push({
            op: `insert:${tableName(table)}:returning`,
            payload: values,
          });
          return [{ id: "new-round-id" }];
        };
        return result;
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          calls.push({ op: `update:${tableName(table)}`, payload: values });
          return Promise.resolve();
        },
      }),
    }),
    query: {
      fantasyTeam: { findMany: async () => teams },
      round: { findFirst: async () => nextUpcoming ?? undefined },
    },
  };

  return { tx, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveRoundMock.mockResolvedValue(ACTIVE_ROUND);
});

describe("closeActiveRound", () => {
  it("sem rodada ativa: devolve null e não escreve nada", async () => {
    getActiveRoundMock.mockResolvedValue(null);
    const { tx, calls } = createTxStub({});

    const result = await closeActiveRound(tx as never);

    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });

  it("com rodada ativa: grava os três snapshots com os valores corretos", async () => {
    const { tx, calls } = createTxStub({});

    await closeActiveRound(tx as never);

    const playerScoreCall = calls.find(
      (c) => c.op === "insert:round_player_score",
    );
    expect(playerScoreCall?.payload).toEqual([
      {
        roundId: ACTIVE_ROUND.id,
        playerId: PLAYER_A.id,
        points: PLAYER_A.score,
        priceBeforeCents: PLAYER_A.priceCents,
        priceAfterCents: PLAYER_A_NEXT_PRICE,
        priceDeltaCents: PLAYER_A_NEXT_PRICE - PLAYER_A.priceCents,
      },
      {
        roundId: ACTIVE_ROUND.id,
        playerId: PLAYER_B.id,
        points: PLAYER_B.score,
        priceBeforeCents: PLAYER_B.priceCents,
        priceAfterCents: PLAYER_B_NEXT_PRICE,
        priceDeltaCents: PLAYER_B_NEXT_PRICE - PLAYER_B.priceCents,
      },
    ]);

    const rosterCall = calls.find((c) => c.op === "insert:round_roster");
    expect(rosterCall?.payload).toEqual([
      {
        roundId: ACTIVE_ROUND.id,
        fantasyTeamId: TEAM.id,
        position: 1,
        playerId: PLAYER_A.id,
        captain: true,
        points: PLAYER_A.score,
        priceCents: PLAYER_A.priceCents,
      },
      {
        roundId: ACTIVE_ROUND.id,
        fantasyTeamId: TEAM.id,
        position: 2,
        playerId: PLAYER_B.id,
        captain: false,
        points: PLAYER_B.score,
        priceCents: PLAYER_B.priceCents,
      },
      {
        roundId: ACTIVE_ROUND.id,
        fantasyTeamId: TEAM.id,
        position: 3,
        playerId: null,
        captain: false,
        points: 0,
        priceCents: 0,
      },
      {
        roundId: ACTIVE_ROUND.id,
        fantasyTeamId: TEAM.id,
        position: 4,
        playerId: null,
        captain: false,
        points: 0,
        priceCents: 0,
      },
      {
        roundId: ACTIVE_ROUND.id,
        fantasyTeamId: TEAM.id,
        position: 5,
        playerId: null,
        captain: false,
        points: 0,
        priceCents: 0,
      },
    ]);

    const teamResultCall = calls.find(
      (c) => c.op === "insert:round_team_result",
    );
    expect(teamResultCall?.payload).toEqual({
      roundId: ACTIVE_ROUND.id,
      fantasyTeamId: TEAM.id,
      // Boaster-like capitão dobra: 10*2 + 20 = 40.
      points: 40,
      balanceCents: TEAM.balanceCents,
      squadValueCents: PLAYER_A.priceCents + PLAYER_B.priceCents,
    });
  });

  it("zera os scores e grava o novo preço do catálogo", async () => {
    const { tx, calls } = createTxStub({});

    await closeActiveRound(tx as never);

    const playerUpdates = calls.filter((c) => c.op === "update:player");
    expect(playerUpdates).toEqual([
      {
        op: "update:player",
        payload: { priceCents: PLAYER_A_NEXT_PRICE, score: 0 },
      },
      {
        op: "update:player",
        payload: { priceCents: PLAYER_B_NEXT_PRICE, score: 0 },
      },
    ]);
  });

  it("finaliza a rodada ativa antes de promover a próxima", async () => {
    const { tx, calls } = createTxStub({});

    const result = await closeActiveRound(tx as never);

    const roundUpdates = calls
      .map((c, index) => ({ ...c, index }))
      .filter((c) => c.op === "update:round");

    expect(roundUpdates).toHaveLength(2);
    expect(roundUpdates[0]?.payload).toEqual({ status: "finished" });
    // Janela herdada válida (contém o agora): promove sem mexer nela.
    expect(roundUpdates[1]?.payload).toEqual({ status: "active" });
    expect(roundUpdates[0]!.index).toBeLessThan(roundUpdates[1]!.index);
    expect(result).toEqual({
      closedRoundId: ACTIVE_ROUND.id,
      nextRoundId: NEXT_UPCOMING_ROUND.id,
    });
  });

  it("janela herdada ainda no futuro: rebaseia o mercado ao promover", async () => {
    const { tx, calls } = createTxStub({
      nextUpcoming: {
        ...NEXT_UPCOMING_ROUND,
        marketOpensAt: new Date(Date.now() + 2 * DAY_MS),
        marketClosesAt: new Date(Date.now() + 5 * DAY_MS),
      },
    });

    await closeActiveRound(tx as never);

    const promotion = calls.filter((c) => c.op === "update:round")[1]
      ?.payload as {
      status: string;
      marketOpensAt?: Date;
      marketClosesAt?: Date;
    };

    expect(promotion.status).toBe("active");
    // Sem isto o jogo entraria na rodada nova com o mercado fechado e sem
    // nenhuma forma de reabri-lo.
    expect(promotion.marketOpensAt?.getTime()).toBeLessThanOrEqual(Date.now());
    expect(promotion.marketClosesAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it("janela herdada já vencida: também rebaseia", async () => {
    const { tx, calls } = createTxStub({
      nextUpcoming: {
        ...NEXT_UPCOMING_ROUND,
        marketOpensAt: new Date(Date.now() - 5 * DAY_MS),
        marketClosesAt: new Date(Date.now() - 2 * DAY_MS),
      },
    });

    await closeActiveRound(tx as never);

    const promotion = calls.filter((c) => c.op === "update:round")[1]
      ?.payload as { marketClosesAt?: Date };

    expect(promotion.marketClosesAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it("sem rodada upcoming: cria a rodada seguinte com janela de 3 dias", async () => {
    const { tx, calls } = createTxStub({ nextUpcoming: null });

    const result = await closeActiveRound(tx as never);

    const created = calls.find((c) => c.op === "insert:round:returning")
      ?.payload as { number: number; status: string } | undefined;
    expect(created?.number).toBe(ACTIVE_ROUND.number + 1);
    expect(created?.status).toBe("active");
    expect(result).toEqual({
      closedRoundId: ACTIVE_ROUND.id,
      nextRoundId: "new-round-id",
    });

    // Nenhum `update:round` de promoção — a próxima nasceu já `active`.
    const roundUpdates = calls.filter((c) => c.op === "update:round");
    expect(roundUpdates).toEqual([
      { op: "update:round", payload: { status: "finished" } },
    ]);
  });

  it("catálogo vazio: não insere round_player_score, mas ainda fecha a rodada", async () => {
    const { tx, calls } = createTxStub({ players: [] });

    const result = await closeActiveRound(tx as never);

    expect(calls.some((c) => c.op === "insert:round_player_score")).toBe(false);
    expect(result).not.toBeNull();
  });
});
