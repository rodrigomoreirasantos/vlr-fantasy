// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueMock, logInfoMock, txHolder } = vi.hoisted(() => ({
  enqueueMock: vi.fn(),
  logInfoMock: vi.fn(),
  txHolder: { tx: {} as unknown },
}));

vi.mock("@/db", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn(txHolder.tx) },
  pool: { end: vi.fn() },
}));
vi.mock("@/lib/vlr/http/log", () => ({ logInfo: logInfoMock }));
vi.mock("@/lib/vlr/jobs/queue", () => ({ enqueue: enqueueMock }));

import { findRosterTeams, syncRosters } from "@/lib/vlr/jobs/sync-rosters";
import { VLR_JOBS } from "@/lib/vlr/jobs/types";

function createTxStub(
  matchRows: { teamA: string; teamB: string }[],
  teamRows: { vlrId: string }[],
) {
  let selectCall = 0;
  return {
    select: () => {
      selectCall += 1;
      const isMatchSelect = selectCall === 1;
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve(matchRows),
          }),
          where: () => Promise.resolve(isMatchSelect ? matchRows : teamRows),
        }),
      };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findRosterTeams", () => {
  it("cruza os times das partidas na janela com vlr_team e devolve os vlrIds", async () => {
    const tx = createTxStub(
      [{ teamA: "NRG", teamB: "SEN" }],
      [{ vlrId: "101" }, { vlrId: "102" }],
    );

    const result = await findRosterTeams(tx as never);

    expect(result).toEqual(["101", "102"]);
  });

  it("sem partida nenhuma na janela, não consulta vlr_team", async () => {
    const tx = createTxStub([], []);

    const result = await findRosterTeams(tx as never);

    expect(result).toEqual([]);
  });
});

describe("syncRosters", () => {
  it("enfileira os times encontrados com o job scrape-roster", async () => {
    txHolder.tx = createTxStub(
      [{ teamA: "NRG", teamB: "SEN" }],
      [{ vlrId: "101" }, { vlrId: "102" }],
    );
    enqueueMock.mockResolvedValue(2);

    const result = await syncRosters();

    expect(result).toEqual({ enqueued: 2 });
    expect(enqueueMock).toHaveBeenCalledWith(
      txHolder.tx,
      VLR_JOBS.scrapeRoster,
      ["101", "102"],
    );
  });
});

describe("syncRosters — backfill --all (Decisão 4, plano 18)", () => {
  /** `findAllTeams` faz `select().from(vlrTeam)` e não chama `.where()`. */
  function createAllTeamsTxStub(teamRows: { vlrId: string }[]) {
    return {
      select: () => ({
        from: () => Promise.resolve(teamRows),
      }),
    };
  }

  it("com all: true, ignora a janela e enfileira todo vlr_team conhecido", async () => {
    txHolder.tx = createAllTeamsTxStub([
      { vlrId: "101" },
      { vlrId: "102" },
      { vlrId: "999" }, // fora da janela de relevância — entra mesmo assim
    ]);
    enqueueMock.mockResolvedValue(3);

    const result = await syncRosters(new Date(), { all: true });

    expect(result).toEqual({ enqueued: 3 });
    expect(enqueueMock).toHaveBeenCalledWith(
      txHolder.tx,
      VLR_JOBS.scrapeRoster,
      ["101", "102", "999"],
    );
  });
});
