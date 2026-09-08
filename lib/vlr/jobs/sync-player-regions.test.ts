// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listPlayerLeagueAppearancesMock,
  listOrganizationMatchesMock,
  dbSelectMock,
  transactionMock,
  updateCalls,
} = vi.hoisted(() => {
  const updateCalls: {
    id: string;
    region: string;
    regionSourceAt: Date | null;
  }[] = [];
  return {
    listPlayerLeagueAppearancesMock: vi.fn(),
    listOrganizationMatchesMock: vi.fn(),
    dbSelectMock: vi.fn(),
    transactionMock: vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          update: () => ({
            set: (values: {
              region: string;
              regionSourceAt?: Date | null;
            }) => ({
              where: (condition: { value: string }) => {
                updateCalls.push({
                  id: condition.value,
                  region: values.region,
                  regionSourceAt: values.regionSourceAt ?? null,
                });
                return Promise.resolve(undefined);
              },
            }),
          }),
        };
        return callback(tx);
      },
    ),
    updateCalls,
  };
});

vi.mock("@/db", () => ({
  db: { select: dbSelectMock, transaction: transactionMock },
}));
vi.mock("@/lib/round/queries", () => ({
  listPlayerLeagueAppearances: listPlayerLeagueAppearancesMock,
  listOrganizationMatches: listOrganizationMatchesMock,
}));
// `eq` real vira uma árvore SQL opaca do drizzle — trocado por um marcador
// introspectável, para o stub de `.where()` conseguir afirmar qual jogador
// cada UPDATE alvejou sem depender de um Postgres de verdade.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (_column: unknown, value: string) => ({ __kind: "eq" as const, value }),
  };
});

import { syncPlayerRegions } from "@/lib/vlr/jobs/sync-player-regions";

const FIXED_DATE = new Date("2026-06-01T00:00:00Z");

function makePlayerRow(overrides: {
  id: string;
  team: string;
  region?: string;
  regionSourceAt?: Date | null;
}) {
  return {
    id: overrides.id,
    team: overrides.team,
    region: overrides.region ?? "other",
    regionSourceAt: overrides.regionSourceAt ?? null,
  };
}

beforeEach(() => {
  updateCalls.length = 0;
  listPlayerLeagueAppearancesMock.mockReset();
  listOrganizationMatchesMock.mockReset();
  dbSelectMock.mockReset();
});

function stubPlayers(rows: ReturnType<typeof makePlayerRow>[]) {
  dbSelectMock.mockReturnValue({ from: () => Promise.resolve(rows) });
}

describe("syncPlayerRegions — a cascata completa", () => {
  it("liga própria mais recente vence e é escrita", async () => {
    listPlayerLeagueAppearancesMock.mockResolvedValue([
      { playerId: "p-league", region: "americas", at: FIXED_DATE },
    ]);
    listOrganizationMatchesMock.mockResolvedValue([]);
    stubPlayers([makePlayerRow({ id: "p-league", team: "LOUD" })]);

    const result = await syncPlayerRegions();

    expect(result.updated).toBe(1);
    expect(updateCalls).toEqual([
      { id: "p-league", region: "americas", regionSourceAt: FIXED_DATE },
    ]);
    expect(result.byRegion.americas).toBe(1);
  });

  it("sem histórico próprio, empresta a liga da organização (sourceAt fica nulo)", async () => {
    listPlayerLeagueAppearancesMock.mockResolvedValue([]);
    listOrganizationMatchesMock.mockResolvedValue([
      {
        teamA: "NRG",
        teamB: "LOUD",
        event: "VCT 2026: Americas Stage 2",
        regionCode: null,
        scheduledAt: FIXED_DATE,
      },
    ]);
    stubPlayers([makePlayerRow({ id: "p-org-only", team: "NRG" })]);

    const result = await syncPlayerRegions();

    expect(result.updated).toBe(1);
    expect(updateCalls).toEqual([
      { id: "p-org-only", region: "americas", regionSourceAt: null },
    ]);
  });

  it("sem histórico e sem organização conhecida, permanece 'other' sem escrever", async () => {
    listPlayerLeagueAppearancesMock.mockResolvedValue([]);
    listOrganizationMatchesMock.mockResolvedValue([]);
    stubPlayers([
      makePlayerRow({ id: "p-unknown", team: "Time Desconhecido" }),
    ]);

    const result = await syncPlayerRegions();

    expect(result.updated).toBe(0);
    expect(updateCalls).toHaveLength(0);
    expect(result.byRegion.other).toBe(1);
  });

  it("já resolvido e sem mudança, não escreve de novo", async () => {
    listPlayerLeagueAppearancesMock.mockResolvedValue([
      { playerId: "p-stable", region: "americas", at: FIXED_DATE },
    ]);
    listOrganizationMatchesMock.mockResolvedValue([]);
    stubPlayers([
      makePlayerRow({
        id: "p-stable",
        team: "LOUD",
        region: "americas",
        regionSourceAt: FIXED_DATE,
      }),
    ]);

    const result = await syncPlayerRegions();

    expect(result.updated).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("um evento internacional no histórico de partidas de organização não vira liga — 'other' continua 'other'", async () => {
    listPlayerLeagueAppearancesMock.mockResolvedValue([]);
    listOrganizationMatchesMock.mockResolvedValue([
      {
        teamA: "LOUD",
        teamB: "FNATIC",
        event: "Valorant Champions 2026",
        regionCode: null,
        scheduledAt: FIXED_DATE,
      },
    ]);
    stubPlayers([makePlayerRow({ id: "p-loud", team: "LOUD" })]);

    const result = await syncPlayerRegions();

    expect(result.updated).toBe(0);
    expect(result.byRegion.other).toBe(1);
  });

  it("resolve vários jogadores numa só chamada, cada um com o próprio caminho da cascata", async () => {
    listPlayerLeagueAppearancesMock.mockResolvedValue([
      { playerId: "p-own", region: "emea", at: FIXED_DATE },
    ]);
    listOrganizationMatchesMock.mockResolvedValue([
      {
        teamA: "DRX",
        teamB: "Gen.G",
        event: "VCT 2026: Pacific Stage 1",
        regionCode: null,
        scheduledAt: FIXED_DATE,
      },
    ]);
    stubPlayers([
      makePlayerRow({ id: "p-own", team: "FNATIC" }),
      makePlayerRow({ id: "p-org", team: "DRX" }),
      makePlayerRow({ id: "p-neither", team: "Time Desconhecido" }),
    ]);

    const result = await syncPlayerRegions();

    expect(result.players).toBe(3);
    expect(result.updated).toBe(2);
    expect(result.byRegion).toEqual({
      americas: 0,
      emea: 1,
      pacific: 1,
      china: 0,
      other: 1,
    });
  });
});
