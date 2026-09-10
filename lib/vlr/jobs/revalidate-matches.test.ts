// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueMock, logInfoMock, txHolder } = vi.hoisted(() => ({
  enqueueMock: vi.fn(),
  logInfoMock: vi.fn(),
  txHolder: { tx: {} as unknown },
}));

vi.mock("@/db", () => ({
  db: {
    transaction: (fn: (tx: unknown) => unknown) => fn(txHolder.tx),
  },
  pool: { end: vi.fn() },
}));
vi.mock("@/lib/vlr/http/log", () => ({ logInfo: logInfoMock }));
vi.mock("@/lib/vlr/jobs/queue", () => ({ enqueue: enqueueMock }));

import {
  findMatchesToRevalidate,
  syncRevalidations,
} from "@/lib/vlr/jobs/revalidate-matches";
import { VLR_JOBS } from "@/lib/vlr/jobs/types";

function createTxStub(rows: { vlrId: string | null }[]) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findMatchesToRevalidate", () => {
  it("devolve os vlrIds das linhas candidatas, descartando `null`", async () => {
    const tx = createTxStub([{ vlrId: "1" }, { vlrId: null }, { vlrId: "2" }]);

    const result = await findMatchesToRevalidate(tx as never);

    expect(result).toEqual(["1", "2"]);
  });

  it("sem candidato nenhum, devolve lista vazia", async () => {
    const tx = createTxStub([]);

    expect(await findMatchesToRevalidate(tx as never)).toEqual([]);
  });
});

describe("syncRevalidations", () => {
  it("enfileira as partidas candidatas com o job revalidate-match", async () => {
    txHolder.tx = createTxStub([{ vlrId: "1" }, { vlrId: "2" }]);
    enqueueMock.mockResolvedValue(2);

    const result = await syncRevalidations();

    expect(result).toEqual({ enqueued: 2 });
    expect(enqueueMock).toHaveBeenCalledWith(
      txHolder.tx,
      VLR_JOBS.revalidateMatch,
      ["1", "2"],
    );
  });

  it("sem candidato nenhum: chama enqueue com lista vazia, nunca vai à rede", async () => {
    txHolder.tx = createTxStub([]);
    enqueueMock.mockResolvedValue(0);

    const result = await syncRevalidations();

    expect(result).toEqual({ enqueued: 0 });
    expect(enqueueMock).toHaveBeenCalledWith(
      txHolder.tx,
      VLR_JOBS.revalidateMatch,
      [],
    );
  });
});
