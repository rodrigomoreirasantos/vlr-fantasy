// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JOB_MAX_AGE_MS } from "@/lib/vlr/jobs/health-policy";

const { selectMock, logInfoMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  logInfoMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: selectMock },
  pool: { end: vi.fn() },
}));
vi.mock("@/lib/vlr/http/log", () => ({ logInfo: logInfoMock }));

import { runHealth } from "@/lib/vlr/jobs/health";

const NOW = new Date("2026-09-10T12:00:00Z");

function mockRows(rows: unknown[]) {
  selectMock.mockReturnValue({ from: () => Promise.resolve(rows) });
}

function allOk() {
  return Object.keys(JOB_MAX_AGE_MS).map((job) => ({
    job,
    lastFinishedAt: NOW,
    lastStatus: "ok" as const,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runHealth", () => {
  it("tudo em dia: healthy true, nada em stale", async () => {
    mockRows(allOk());

    const result = await runHealth(NOW);

    expect(result).toEqual({ healthy: true, stale: [] });
  });

  it("job que nunca rodou: healthy false, aparece em stale por nome", async () => {
    mockRows(allOk().filter((row) => row.job !== "vlr:doctor"));

    const result = await runHealth(NOW);

    expect(result.healthy).toBe(false);
    expect(result.stale).toContain("vlr:doctor");
  });

  it("job atrasado além da tolerância: healthy false", async () => {
    const rows = allOk().map((row) =>
      row.job === "vlr:results"
        ? { ...row, lastFinishedAt: new Date(NOW.getTime() - 10 * 60_000) }
        : row,
    );
    mockRows(rows);

    const result = await runHealth(NOW);

    expect(result.healthy).toBe(false);
    expect(result.stale).toContain("vlr:results");
  });

  it("job que terminou em falha: healthy false, mesmo recente", async () => {
    const rows = allOk().map((row) =>
      row.job === "vlr:round" ? { ...row, lastStatus: "failed" } : row,
    );
    mockRows(rows);

    const result = await runHealth(NOW);

    expect(result.healthy).toBe(false);
    expect(result.stale).toContain("vlr:round");
  });
});
