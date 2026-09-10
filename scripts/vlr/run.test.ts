// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordJobRunMock, poolEndMock, dbTransactionMock, logErrorMock } =
  vi.hoisted(() => ({
    recordJobRunMock: vi.fn(),
    poolEndMock: vi.fn(),
    dbTransactionMock: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
    logErrorMock: vi.fn(),
  }));

vi.mock("@/db", () => ({
  db: { transaction: dbTransactionMock },
  pool: { end: poolEndMock },
}));
vi.mock("@/lib/vlr/http/log", () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  logError: logErrorMock,
}));
vi.mock("@/lib/vlr/persist/health", () => ({
  recordJobRun: recordJobRunMock,
}));

import { runScript } from "@/scripts/vlr/run";

const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.clearAllMocks();
  dbTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({}),
  );
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = originalExitCode;
});

describe("runScript", () => {
  it("sucesso: grava batimento com status ok e o resumo", async () => {
    await runScript("vlr:events", async () => ({
      ok: true,
      summary: "✓ 3 eventos",
    }));

    expect(recordJobRunMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        job: "vlr:events",
        status: "ok",
        summary: "✓ 3 eventos",
        error: null,
      }),
    );
    expect(process.exitCode).toBeUndefined();
    expect(poolEndMock).toHaveBeenCalledTimes(1);
  });

  it("ok: false (sem lançar): grava status failed e marca exit code 1 — mesmo caminho de vlr:doctor", async () => {
    await runScript("vlr:doctor", async () => ({
      ok: false,
      summary: "✗ seletor quebrado",
    }));

    expect(recordJobRunMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ job: "vlr:doctor", status: "failed" }),
    );
    expect(process.exitCode).toBe(1);
  });

  it("lança exceção: grava status failed com a mensagem do erro", async () => {
    await runScript("vlr:round", async () => {
      throw new Error("conexão recusada");
    });

    expect(recordJobRunMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        job: "vlr:round",
        status: "failed",
        error: "conexão recusada",
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it("falha ao gravar o batimento não muda o exit code do job", async () => {
    recordJobRunMock.mockRejectedValue(new Error("banco fora do ar"));

    await runScript("vlr:events", async () => ({
      ok: true,
      summary: "✓ tudo certo",
    }));

    expect(process.exitCode).toBeUndefined();
    expect(logErrorMock).toHaveBeenCalledWith(
      "vlr.script.health_record_failed",
      expect.objectContaining({ script: "vlr:events" }),
    );
    expect(poolEndMock).toHaveBeenCalledTimes(1);
  });
});
