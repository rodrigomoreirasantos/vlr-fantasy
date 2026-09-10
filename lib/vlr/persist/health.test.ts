// @vitest-environment node
import { describe, expect, it } from "vitest";

import { recordJobRun } from "@/lib/vlr/persist/health";

/** Captura `values` e o `set` do upsert. */
function createTxStub() {
  let insertedValues: Record<string, unknown> | null = null;
  let conflictSet: Record<string, unknown> | null = null;

  const tx = {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValues = values;
        return {
          onConflictDoUpdate: (config: { set: Record<string, unknown> }) => {
            conflictSet = config.set;
            return Promise.resolve();
          },
        };
      },
    }),
  };

  return { tx, values: () => insertedValues, set: () => conflictSet };
}

/** O SQL de uma coluna do `set`, com os fragmentos do Drizzle achatados em texto. */
function sqlTextOf(value: unknown): string {
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks
    .map((chunk) =>
      typeof chunk === "object" && chunk !== null && "value" in chunk
        ? String((chunk as { value: unknown }).value)
        : String(chunk),
    )
    .join(" ");
}

const STARTED_AT = new Date("2026-09-10T12:00:00Z");
const FINISHED_AT = new Date("2026-09-10T12:00:05Z");

describe("recordJobRun", () => {
  it("sucesso: grava status ok, duração e zera consecutiveFailures", async () => {
    const { tx, values, set } = createTxStub();

    await recordJobRun(tx as never, {
      job: "vlr:results",
      status: "ok",
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      summary: "3 partidas",
    });

    expect(values()).toMatchObject({
      job: "vlr:results",
      lastStatus: "ok",
      lastDurationMs: 5000,
      lastSummary: "3 partidas",
      lastError: null,
      consecutiveFailures: 0,
    });
    expect(sqlTextOf(set()!.consecutiveFailures)).toBe("0");
  });

  it("falha: grava status failed, o erro, e incrementa consecutiveFailures", async () => {
    const { tx, values, set } = createTxStub();

    await recordJobRun(tx as never, {
      job: "vlr:results",
      status: "failed",
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      error: "seletor quebrou",
    });

    expect(values()).toMatchObject({
      lastStatus: "failed",
      lastError: "seletor quebrou",
      consecutiveFailures: 1,
    });
    expect(sqlTextOf(set()!.consecutiveFailures)).toContain("+ 1");
  });

  it("sem summary/error informados, grava null", async () => {
    const { tx, values } = createTxStub();

    await recordJobRun(tx as never, {
      job: "vlr:doctor",
      status: "ok",
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
    });

    expect(values()).toMatchObject({ lastSummary: null, lastError: null });
  });
});
