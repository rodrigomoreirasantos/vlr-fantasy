// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  scrapeMatch: vi.fn(),
  revalidateMatch: vi.fn(),
  scrapeRoster: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) },
  pool: { end: vi.fn() },
}));
vi.mock("@/lib/vlr/http/log", () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  logInfo: mocks.logInfo,
  logError: mocks.logError,
}));
vi.mock("@/lib/vlr/jobs/queue", () => ({
  claim: mocks.claim,
  complete: mocks.complete,
  fail: mocks.fail,
}));
vi.mock("@/lib/vlr/jobs/scrape-match", () => ({
  scrapeMatch: mocks.scrapeMatch,
  revalidateMatch: mocks.revalidateMatch,
}));
vi.mock("@/lib/vlr/jobs/scrape-roster", () => ({
  scrapeRoster: mocks.scrapeRoster,
}));

import { workQueue } from "@/lib/vlr/jobs/work";

type Job = { id: string; job: string; key: string; attempts: number };

/** Uma fila por tipo de job — `claim` consome na ordem em que foi montada. */
function mockQueues(queues: Record<string, Job[]>) {
  mocks.claim.mockImplementation((_tx: unknown, job: string) => {
    const queue = queues[job] ?? [];
    return Promise.resolve(queue.shift() ?? null);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scrapeMatch.mockResolvedValue({ matchId: "m", statCount: 1 });
  mocks.revalidateMatch.mockResolvedValue({ changed: false });
  mocks.scrapeRoster.mockResolvedValue({ updated: 1, unknown: 0, left: 0 });
});

describe("workQueue", () => {
  it("reivindica e processa os três tipos de trabalho, cada um com seu handler", async () => {
    mockQueues({
      "scrape-match": [
        { id: "j1", job: "scrape-match", key: "m1", attempts: 1 },
      ],
      "revalidate-match": [
        { id: "j2", job: "revalidate-match", key: "m2", attempts: 1 },
      ],
      "scrape-roster": [
        { id: "j3", job: "scrape-roster", key: "t1", attempts: 1 },
      ],
    });

    const result = await workQueue({ limit: 10 });

    expect(result).toEqual({ done: 3, failed: 0 });
    expect(mocks.scrapeMatch).toHaveBeenCalledWith("m1");
    expect(mocks.revalidateMatch).toHaveBeenCalledWith("m2");
    expect(mocks.scrapeRoster).toHaveBeenCalledWith("t1");
    expect(mocks.complete).toHaveBeenCalledTimes(3);
  });

  it("falha isolada num tipo não impede os outros dois", async () => {
    mockQueues({
      "scrape-match": [
        { id: "j1", job: "scrape-match", key: "m1", attempts: 1 },
      ],
      "revalidate-match": [
        { id: "j2", job: "revalidate-match", key: "m2", attempts: 1 },
      ],
      "scrape-roster": [
        { id: "j3", job: "scrape-roster", key: "t1", attempts: 1 },
      ],
    });
    mocks.scrapeMatch.mockRejectedValue(new Error("seletor quebrou"));

    const result = await workQueue({ limit: 10 });

    expect(result).toEqual({ done: 2, failed: 1 });
    expect(mocks.fail).toHaveBeenCalledWith(
      {},
      { id: "j1", attempts: 1, error: "seletor quebrou" },
    );
    expect(mocks.revalidateMatch).toHaveBeenCalledWith("m2");
    expect(mocks.scrapeRoster).toHaveBeenCalledWith("t1");
    expect(mocks.complete).toHaveBeenCalledTimes(2);
  });

  it("sem trabalho pendente em nenhum dos três, encerra sem chamar handler", async () => {
    mockQueues({});

    const result = await workQueue({ limit: 10 });

    expect(result).toEqual({ done: 0, failed: 0 });
    expect(mocks.scrapeMatch).not.toHaveBeenCalled();
    expect(mocks.revalidateMatch).not.toHaveBeenCalled();
    expect(mocks.scrapeRoster).not.toHaveBeenCalled();
  });
});
