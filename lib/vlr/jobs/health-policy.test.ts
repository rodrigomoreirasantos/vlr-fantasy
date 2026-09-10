// @vitest-environment node
import { describe, expect, it } from "vitest";

import { JOB_MAX_AGE_MS, staleJobs } from "@/lib/vlr/jobs/health-policy";
import type { JobHealthRow } from "@/lib/vlr/jobs/health-policy";

const NOW = new Date("2026-09-10T12:00:00Z");

function allJobsOk(
  overrides: Partial<Record<string, Partial<JobHealthRow>>> = {},
) {
  return Object.keys(JOB_MAX_AGE_MS).map((job) => ({
    job,
    lastFinishedAt: NOW,
    lastStatus: "ok" as const,
    ...overrides[job],
  }));
}

describe("staleJobs", () => {
  it("não acusa nada quando todo job rodou agora mesmo", () => {
    expect(staleJobs(allJobsOk(), NOW)).toEqual([]);
  });

  it("acusa job que nunca rodou (ausente das linhas)", () => {
    const rows = allJobsOk().filter((row) => row.job !== "vlr:results");

    expect(staleJobs(rows, NOW)).toContain("vlr:results");
  });

  it("acusa job cujo lastFinishedAt é null", () => {
    const rows = allJobsOk({
      "vlr:work": { lastFinishedAt: null, lastStatus: null },
    });

    expect(staleJobs(rows, NOW)).toContain("vlr:work");
  });

  it("acusa job atrasado além da tolerância", () => {
    const rows = allJobsOk({
      "vlr:results": {
        lastFinishedAt: new Date(NOW.getTime() - 10 * 60_000),
      },
    });

    expect(staleJobs(rows, NOW)).toContain("vlr:results");
  });

  it("ignora job dentro da tolerância", () => {
    const rows = allJobsOk({
      "vlr:results": {
        lastFinishedAt: new Date(NOW.getTime() - 2 * 60_000),
      },
    });

    expect(staleJobs(rows, NOW)).not.toContain("vlr:results");
  });

  it("acusa job que terminou em falha, mesmo recente", () => {
    const rows = allJobsOk({
      "vlr:doctor": {
        lastFinishedAt: new Date(NOW.getTime() - 60_000),
        lastStatus: "failed",
      },
    });

    expect(staleJobs(rows, NOW)).toContain("vlr:doctor");
  });
});
