import { beforeEach, describe, expect, it, vi } from "vitest";

// `getActiveRound` mockado como qualquer outra primitiva nomeada
// (lib/team/queries.ts) — `@/db` também, para o import de topo de
// `db/close-round.ts` não abrir uma conexão real. `refreshPlayerForm`
// mockado porque pertence a outro módulo (Fase 2, plano 20) e é testado lá.
const { getActiveRoundMock, refreshPlayerFormMock } = vi.hoisted(() => ({
  getActiveRoundMock: vi.fn(),
  refreshPlayerFormMock: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {}, pool: { end: vi.fn() } }));
vi.mock("@/lib/team/queries", () => ({
  getActiveRound: getActiveRoundMock,
}));
vi.mock("@/lib/vlr/jobs/calculate-round", () => ({
  refreshPlayerForm: refreshPlayerFormMock,
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
import { MAX_PATRIMONY_CENTS } from "@/lib/market/budget";
import {
  MAX_PRICE_CENTS,
  MAX_STEP_CENTS,
  MIN_PRICE_CENTS,
  nextPriceCents,
} from "@/lib/scoring/pricing";

const ACTIVE_ROUND = { id: "round-1", number: 1 };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Janela herdada válida: contém o "agora", então a promoção a respeita. */
const NEXT_UPCOMING_ROUND = {
  id: "round-2",
  number: 2,
  marketOpensAt: new Date(Date.now() - DAY_MS),
  marketClosesAt: new Date(Date.now() + DAY_MS),
};

// `gamesPlayed` alto de propósito: estes dois são veteranos, então
// `dampingFactor` vale 1. `formPoints` escolhido para o passo bater no teto
// de 8,0 cr nos dois sentidos — é o caso mais fácil de conferir por fora.
const PLAYER_A = {
  id: "player-a",
  score: 10,
  priceCents: 4_000, // 40,0 cr
  formPoints: 80, // alvo = 72,5 cr → diferença grande, passo capa em 8,0
  gamesPlayed: 9,
};
const PLAYER_B = {
  id: "player-b",
  score: 20,
  priceCents: 6_000, // 60,0 cr
  formPoints: 20, // alvo = MIN (20,0 cr) → diferença grande, passo capa em -8,0
  gamesPlayed: 9,
};
const PLAYER_A_NEXT_PRICE = PLAYER_A.priceCents + MAX_STEP_CENTS; // 4.800
const PLAYER_B_NEXT_PRICE = PLAYER_B.priceCents - MAX_STEP_CENTS; // 5.200

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
  refreshPlayerFormMock.mockResolvedValue({ players: 0 });
});

describe("closeActiveRound", () => {
  it("sem rodada ativa: devolve null e não escreve nada, nem atualiza a forma", async () => {
    getActiveRoundMock.mockResolvedValue(null);
    const { tx, calls } = createTxStub({});

    const result = await closeActiveRound(tx as never);

    expect(result).toBeNull();
    expect(calls).toEqual([]);
    expect(refreshPlayerFormMock).not.toHaveBeenCalled();
  });

  it("atualiza a forma do catálogo antes de qualquer reprecificação", async () => {
    const { tx } = createTxStub({});

    await closeActiveRound(tx as never);

    expect(refreshPlayerFormMock).toHaveBeenCalledWith(tx);
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
      // Patrimônio (3.000 saldo + 10.000 elenco novo) bem abaixo do teto:
      // nada é cortado nesta rodada.
      budgetTrimmedCents: 0,
    });
  });

  it("zera os scores e grava o novo preço do catálogo — sem tocar gamesPlayed", async () => {
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
    // `gamesPlayed` vem de `refreshPlayerForm` (passo 1), não de incremento
    // aqui — nenhum payload de `update:player` o contém.
    expect(
      playerUpdates.every((c) => !("gamesPlayed" in (c.payload as object))),
    ).toBe(true);
  });

  it("quem não pontuou fica com preço idêntico e delta 0 (Decisão 7)", async () => {
    const benched = {
      id: "player-c",
      score: 0,
      priceCents: 8_000,
      formPoints: 90, // mesmo com alvo bem acima, não pontuou → não mexe.
      gamesPlayed: 4,
    };
    const { tx, calls } = createTxStub({ players: [PLAYER_A, benched] });

    await closeActiveRound(tx as never);

    const update = calls.filter((c) => c.op === "update:player")[1];
    expect(update.payload).toEqual({ priceCents: benched.priceCents, score: 0 });

    const scoreSnapshot = (
      calls.find((c) => c.op === "insert:round_player_score")
        ?.payload as unknown[]
    )[1];
    expect(scoreSnapshot).toMatchObject({
      priceBeforeCents: benched.priceCents,
      priceAfterCents: benched.priceCents,
      priceDeltaCents: 0,
    });
  });

  it("um jogador com forma alta sobe no máximo 8,0 cr; um com forma baixa desce no máximo 8,0 cr", async () => {
    const { tx, calls } = createTxStub({});

    await closeActiveRound(tx as never);

    const updates = calls.filter((c) => c.op === "update:player");
    expect(
      (updates[0].payload as { priceCents: number }).priceCents -
        PLAYER_A.priceCents,
    ).toBe(MAX_STEP_CENTS);
    expect(
      (updates[1].payload as { priceCents: number }).priceCents -
        PLAYER_B.priceCents,
    ).toBe(-MAX_STEP_CENTS);
  });

  it("preço prende em MAX_PRICE_CENTS e em MIN_PRICE_CENTS — nunca passa", async () => {
    const atMax = {
      id: "player-max",
      score: 5,
      priceCents: MAX_PRICE_CENTS, // já no teto
      formPoints: 200, // alvo continua no teto — nada empurra para além dele
      gamesPlayed: 9,
    };
    const atMin = {
      id: "player-min",
      score: 5,
      priceCents: MIN_PRICE_CENTS, // já no piso
      formPoints: -50, // alvo continua no piso — nada empurra abaixo dele
      gamesPlayed: 9,
    };
    const { tx, calls } = createTxStub({ players: [atMax, atMin] });

    await closeActiveRound(tx as never);

    const updates = calls.filter((c) => c.op === "update:player");
    expect((updates[0].payload as { priceCents: number }).priceCents).toBe(
      MAX_PRICE_CENTS,
    );
    expect((updates[1].payload as { priceCents: number }).priceCents).toBe(
      MIN_PRICE_CENTS,
    );
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

  it("um usuário com 5 times (um por região): grava 5 linhas de round_team_result, uma por time", async () => {
    // `.claude/plans/10-time-por-regiao.md` — `closeActiveRound` itera
    // `fantasyTeam.findMany()` sem distinguir usuário; o teste de regressão
    // é que N times (mesmo usuário ou não) viram N linhas, nunca uma só.
    const teams = ["americas", "emea", "pacific", "china", "international"].map(
      (region, index) => ({
        id: `team-${region}`,
        region,
        balanceCents: 1000 * (index + 1),
        slots: [],
      }),
    );
    const { tx, calls } = createTxStub({ teams });

    await closeActiveRound(tx as never);

    const teamResultCalls = calls.filter(
      (c) => c.op === "insert:round_team_result",
    );
    expect(teamResultCalls).toHaveLength(5);
    expect(
      teamResultCalls.map(
        (c) => (c.payload as { fantasyTeamId: string }).fantasyTeamId,
      ),
    ).toEqual(teams.map((t) => t.id));
  });

  describe("teto de patrimônio (Decisões 3, 4 e 5)", () => {
    // Cinco jogadores presos no teto (MAX_PRICE_CENTS) para o patrimônio do
    // time estourar MAX_PATRIMONY_CENTS de propósito.
    const STAR_PLAYERS = Array.from({ length: 5 }, (_, index) => ({
      id: `star-${index}`,
      score: 10,
      priceCents: MAX_PRICE_CENTS,
      formPoints: 200,
      gamesPlayed: 9,
    }));

    function starTeam(balanceCents: number) {
      return {
        id: "team-stars",
        balanceCents,
        slots: STAR_PLAYERS.map((p, index) => ({
          position: index + 1,
          playerId: p.id,
          captain: index === 0,
          player: p,
        })),
      };
    }

    it("patrimônio acima do teto: corta o caixa, grava budgetTrimmedCents, elenco intacto", async () => {
      // Elenco (5 × 90,0 = 450,0) + saldo 50,0 = patrimônio 500,0 — bem acima
      // do teto de 360,0. Excedente = 140,0, mas o corte nunca passa do
      // caixa disponível (5.000 cents = 50,0 cr).
      const { tx, calls } = createTxStub({
        players: STAR_PLAYERS,
        teams: [starTeam(5_000)],
      });

      await closeActiveRound(tx as never);

      const teamResult = calls.find(
        (c) => c.op === "insert:round_team_result",
      )?.payload as { budgetTrimmedCents: number };
      // O caixa inteiro (5.000) é menor que o excedente teórico — o corte é
      // o caixa inteiro.
      expect(teamResult.budgetTrimmedCents).toBe(5_000);

      const balanceUpdate = calls.find((c) => c.op === "update:fantasy_team")
        ?.payload as { balanceCents: number };
      expect(balanceUpdate.balanceCents).toBe(0);

      // Nenhum jogador foi vendido: os 5 `update:player` continuam lá, cada
      // um preso em MAX_PRICE_CENTS.
      const playerUpdates = calls.filter((c) => c.op === "update:player");
      expect(playerUpdates).toHaveLength(5);
      expect(
        playerUpdates.every(
          (c) =>
            (c.payload as { priceCents: number }).priceCents ===
            MAX_PRICE_CENTS,
        ),
      ).toBe(true);
    });

    it("elenco sozinho já vale mais que o teto: saldo fica 0, nunca negativo", async () => {
      // Elenco (450,0) sozinho já passa do teto (360,0) — mesmo cortando o
      // caixa inteiro (20,0), o patrimônio continua acima dele. O saldo vai
      // a 0, nunca fica negativo.
      const { tx, calls } = createTxStub({
        players: STAR_PLAYERS,
        teams: [starTeam(2_000)],
      });

      await closeActiveRound(tx as never);

      const balanceUpdate = calls.find((c) => c.op === "update:fantasy_team")
        ?.payload as { balanceCents: number };
      expect(balanceUpdate.balanceCents).toBe(0);

      const teamResult = calls.find(
        (c) => c.op === "insert:round_team_result",
      )?.payload as { budgetTrimmedCents: number };
      expect(teamResult.budgetTrimmedCents).toBe(2_000);
    });

    it("patrimônio dentro do teto: não corta nada, não atualiza fantasy_team", async () => {
      const { tx, calls } = createTxStub({});

      await closeActiveRound(tx as never);

      expect(
        calls.some((c) => c.op === "update:fantasy_team"),
      ).toBe(false);
      // Referência viva às constantes — se `MAX_PATRIMONY_CENTS` cair abaixo
      // do patrimônio de `TEAM`, este teste passa a mentir sobre o motivo.
      expect(
        TEAM.balanceCents + PLAYER_A.priceCents + PLAYER_B.priceCents,
      ).toBeLessThan(MAX_PATRIMONY_CENTS);
    });
  });
});

// A invariante que `round_player_score_delta_consistent` (CHECK do banco)
// exige — confere que o teste acima usa a mesma função de produção.
describe("consistência com o motor de preço", () => {
  it("PLAYER_A_NEXT_PRICE e PLAYER_B_NEXT_PRICE batem com nextPriceCents", () => {
    expect(
      nextPriceCents({
        priceCents: PLAYER_A.priceCents,
        formPoints: PLAYER_A.formPoints,
        gamesPlayed: PLAYER_A.gamesPlayed,
      }),
    ).toBe(PLAYER_A_NEXT_PRICE);
    expect(
      nextPriceCents({
        priceCents: PLAYER_B.priceCents,
        formPoints: PLAYER_B.formPoints,
        gamesPlayed: PLAYER_B.gamesPlayed,
      }),
    ).toBe(PLAYER_B_NEXT_PRICE);
  });
});
