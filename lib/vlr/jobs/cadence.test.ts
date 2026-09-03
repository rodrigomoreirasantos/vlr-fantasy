// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, pool: { end: vi.fn() } }));

import {
  KICKOFF_LEAD_MS,
  MATCH_TAIL_MS,
  countMatchesInPlay,
  isMatchWindow,
  matchWindow,
} from "@/lib/vlr/jobs/cadence";
import type { Querier } from "@/lib/team/queries";

const NOW = new Date("2026-09-03T12:00:00Z");

/** Um `Querier` que devolve a contagem pedida, sem exercer o SQL. */
function createQuerierStub(count: number): Querier {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => Promise.resolve([{ count }]),
  };

  return { select: () => chain } as unknown as Querier;
}

describe("matchWindow", () => {
  it("abre um pouco antes do kickoff e fecha bem depois dele", () => {
    const { from, to } = matchWindow(NOW);

    expect(to.getTime() - NOW.getTime()).toBe(KICKOFF_LEAD_MS);
    expect(NOW.getTime() - from.getTime()).toBe(MATCH_TAIL_MS);
  });

  it("a cauda é longa o bastante para uma Bo5, e finita", () => {
    expect(MATCH_TAIL_MS).toBeGreaterThan(6 * 60 * 60_000);
    expect(MATCH_TAIL_MS).toBeLessThanOrEqual(24 * 60 * 60_000);
  });
});

describe("countMatchesInPlay", () => {
  it("conta o que o banco devolveu", async () => {
    await expect(countMatchesInPlay(NOW, createQuerierStub(3))).resolves.toBe(
      3,
    );
  });

  it("banco sem linha nenhuma não vira `NaN`", async () => {
    const empty = {
      select: () => ({
        from: () => empty.select(),
        innerJoin: () => empty.select(),
        where: () => Promise.resolve([]),
      }),
    } as unknown as Querier;

    await expect(countMatchesInPlay(NOW, empty)).resolves.toBe(0);
  });
});

describe("isMatchWindow", () => {
  it("com partida em curso, manda ir à rede", async () => {
    await expect(isMatchWindow(NOW, createQuerierStub(1))).resolves.toBe(true);
  });

  it("sem nenhuma, segura a requisição", async () => {
    await expect(isMatchWindow(NOW, createQuerierStub(0))).resolves.toBe(false);
  });
});
