// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertTeamsMock, inSavepointMock, findFirstMock, findManyMock } =
  vi.hoisted(() => ({
    upsertTeamsMock: vi.fn(),
    inSavepointMock: vi.fn(),
    findFirstMock: vi.fn(),
    findManyMock: vi.fn(),
  }));

vi.mock("@/lib/vlr/persist/teams", () => ({ upsertTeams: upsertTeamsMock }));
vi.mock("@/lib/vlr/persist/players", () => ({
  inSavepoint: inSavepointMock,
}));
vi.mock("@/lib/vlr/http/log", () => ({ logWarn: vi.fn() }));

import { applyRoster } from "@/lib/vlr/persist/rosters";
import type { ScrapedTeamRoster } from "@/lib/vlr/schemas";

type UpdateCall = { id: string; values: Record<string, unknown> };

function createTxStub() {
  const updateCalls: UpdateCall[] = [];
  const tx = {
    query: {
      player: { findFirst: findFirstMock, findMany: findManyMock },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: { value: string }) => {
          updateCalls.push({ id: condition.value, values });
          return Promise.resolve(undefined);
        },
      }),
    }),
  };
  return { tx, updateCalls };
}

// `eq` real vira árvore SQL opaca — trocado por um marcador introspectável.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (_col: unknown, value: unknown) => ({ __kind: "eq" as const, value }),
  };
});

const ROSTER: ScrapedTeamRoster = {
  vlrId: "17037",
  name: "Glacial Guardians",
  tag: "GG",
  region: "kr",
  players: [
    {
      vlrId: "1",
      nickname: "yuno",
      realName: null,
      country: "kr",
      photoUrl: "https://owcdn.net/img/x.png",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  upsertTeamsMock.mockResolvedValue(new Map());
  inSavepointMock.mockResolvedValue(true);
  findManyMock.mockResolvedValue([]);
});

describe("applyRoster", () => {
  it("troca de organização é gravada, e o elenco fica registrado", async () => {
    const { tx, updateCalls } = createTxStub();
    findFirstMock.mockResolvedValue({
      id: "player-1",
      nickname: "yuno",
      realName: null,
      country: null,
      photoUrl: null,
    });

    const result = await applyRoster(tx as never, ROSTER);

    expect(result).toEqual({ updated: 1, unknown: 0, left: 0 });
    expect(upsertTeamsMock).toHaveBeenCalledWith(tx, [
      { vlrId: "17037", name: "Glacial Guardians", tag: "GG", region: "kr" },
    ]);
    expect(updateCalls).toEqual([
      {
        id: "player-1",
        values: {
          team: "Glacial Guardians",
          realName: null,
          country: "kr",
          photoUrl: "https://owcdn.net/img/x.png",
          rosterMissingSince: null,
        },
      },
    ]);
  });

  it("não apaga a foto existente quando o scrape vem sem foto", async () => {
    const { tx, updateCalls } = createTxStub();
    findFirstMock.mockResolvedValue({
      id: "player-1",
      nickname: "yuno",
      realName: null,
      country: null,
      photoUrl: "https://owcdn.net/img/existing.png",
    });
    const rosterWithoutPhoto: ScrapedTeamRoster = {
      ...ROSTER,
      players: [{ ...ROSTER.players[0], photoUrl: null }],
    };

    await applyRoster(tx as never, rosterWithoutPhoto);

    expect(updateCalls[0].values.photoUrl).toBe(
      "https://owcdn.net/img/existing.png",
    );
  });

  it("jogador de elenco sem registro em `player` é ignorado — nunca criado", async () => {
    const { tx, updateCalls } = createTxStub();
    findFirstMock.mockResolvedValue(null);

    const result = await applyRoster(tx as never, ROSTER);

    expect(result).toEqual({ updated: 0, unknown: 1, left: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it("colisão de apelido não aborta o lote — segue sem renomear e registra o resto", async () => {
    const { tx, updateCalls } = createTxStub();
    findFirstMock.mockResolvedValue({
      id: "player-1",
      nickname: "outro-nick",
      realName: null,
      country: null,
    });
    inSavepointMock.mockResolvedValue(false); // colisão de UNIQUE no savepoint

    const result = await applyRoster(tx as never, ROSTER);

    expect(result).toEqual({ updated: 1, unknown: 0, left: 0 });
    // O nome não muda (a colisão impediu), mas time/país/rosterMissingSince
    // são gravados do mesmo jeito.
    expect(updateCalls.find((c) => c.values.team)).toBeDefined();
  });

  it("jogador que saiu do elenco recebe rosterMissingSince e continua no catálogo", async () => {
    const { tx, updateCalls } = createTxStub();
    const emptyRoster: ScrapedTeamRoster = { ...ROSTER, players: [] };
    findManyMock.mockResolvedValue([
      {
        id: "player-2",
        vlrId: "2",
        team: "Glacial Guardians",
        rosterMissingSince: null,
      },
    ]);

    const result = await applyRoster(tx as never, emptyRoster);

    expect(result).toEqual({ updated: 0, unknown: 0, left: 1 });
    expect(updateCalls).toEqual([
      {
        id: "player-2",
        values: { rosterMissingSince: expect.any(Date) },
      },
    ]);
  });

  it("é idempotente: rodar de novo sobre quem já está sinalizado não gera update", async () => {
    const { tx, updateCalls } = createTxStub();
    const emptyRoster: ScrapedTeamRoster = { ...ROSTER, players: [] };
    findManyMock.mockResolvedValue([
      {
        id: "player-2",
        vlrId: "2",
        team: "Glacial Guardians",
        rosterMissingSince: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

    const result = await applyRoster(tx as never, emptyRoster);

    expect(result).toEqual({ updated: 0, unknown: 0, left: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it("quem continua no elenco não é sinalizado como saído — só o update do elenco acontece", async () => {
    const { tx, updateCalls } = createTxStub();
    findFirstMock.mockResolvedValue({
      id: "player-1",
      nickname: "yuno",
      realName: null,
      country: null,
    });
    findManyMock.mockResolvedValue([
      {
        id: "player-1",
        vlrId: "1",
        team: "Glacial Guardians",
        rosterMissingSince: null,
      },
    ]);

    await applyRoster(tx as never, ROSTER);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({
      id: "player-1",
      values: {
        team: "Glacial Guardians",
        realName: null,
        country: "kr",
        photoUrl: "https://owcdn.net/img/x.png",
        rosterMissingSince: null,
      },
    });
  });
});
