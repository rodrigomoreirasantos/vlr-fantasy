// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, updateSetMock, updateCalls } = vi.hoisted(() => {
  const updateCalls: { id: string; values: Record<string, unknown> }[] = [];
  return {
    findManyMock: vi.fn(),
    updateSetMock: vi.fn(),
    updateCalls,
  };
});

vi.mock("@/db", () => ({
  db: {
    query: { player: { findMany: findManyMock } },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: { value: string }) => {
          updateCalls.push({ id: condition.value, values });
          return Promise.resolve(undefined);
        },
      }),
    }),
  },
}));
// `eq` real vira uma árvore SQL opaca do drizzle — trocado por um marcador
// introspectável (mesmo truque de `sync-player-regions.test.ts`), para o
// stub de `.where()` conseguir afirmar qual jogador cada UPDATE alvejou.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (_column: unknown, value: string) => ({ __kind: "eq" as const, value }),
  };
});

import { activateConfidentPlayers } from "@/lib/vlr/jobs/activate-confident-players";

function row(overrides: {
  id: string;
  vlrId?: string | null;
  nickname?: string;
  agent?: string;
  role?: string;
}) {
  return {
    id: overrides.id,
    // `??` trataria um `vlrId: null` explícito como "não informado" e
    // devolveria o default — o oposto do que o teste de `vlrId` nulo precisa.
    vlrId: "vlrId" in overrides ? overrides.vlrId : "1000",
    nickname: overrides.nickname ?? "player",
    agent: overrides.agent ?? "Phoenix",
    role: overrides.role ?? "Duelista",
  };
}

beforeEach(() => {
  updateCalls.length = 0;
  findManyMock.mockReset();
});

describe("activateConfidentPlayers", () => {
  it("ativa quem tem vlrId, agente reconhecido batendo com a função e nickname sem colisão", async () => {
    findManyMock.mockResolvedValue([
      row({ id: "sato", agent: "Phoenix", role: "Duelista" }),
    ]);

    const result = await activateConfidentPlayers();

    expect(result).toEqual({ reviewed: 1, activated: 1 });
    expect(updateCalls).toEqual([
      { id: "sato", values: { active: true, needsReview: false } },
    ]);
  });

  it("não ativa quem não tem vlrId", async () => {
    findManyMock.mockResolvedValue([row({ id: "sem-vlr-id", vlrId: null })]);

    const result = await activateConfidentPlayers();

    expect(result).toEqual({ reviewed: 1, activated: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it("não ativa quem tem agente desconhecido (caiu no FALLBACK_ROLE)", async () => {
    findManyMock.mockResolvedValue([
      row({ id: "agente-novo", agent: "Agente Novo", role: "Duelista" }),
    ]);

    const result = await activateConfidentPlayers();

    expect(result).toEqual({ reviewed: 1, activated: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it("não ativa quando o agente gravado não bate com a função gravada", async () => {
    // Linha inconsistente (dado corrompido/editado à mão): não é confiança.
    findManyMock.mockResolvedValue([
      row({ id: "inconsistente", agent: "Phoenix", role: "Sentinela" }),
    ]);

    const result = await activateConfidentPlayers();

    expect(result).toEqual({ reviewed: 1, activated: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it("não ativa nickname sufixado por colisão, mesmo com agente confiável", async () => {
    findManyMock.mockResolvedValue([
      row({ id: "colidido", nickname: "edith (30395)" }),
    ]);

    const result = await activateConfidentPlayers();

    expect(result).toEqual({ reviewed: 1, activated: 0 });
    expect(updateCalls).toHaveLength(0);
  });

  it("é idempotente: sem ninguém pendente, não faz nada", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await activateConfidentPlayers();

    expect(result).toEqual({ reviewed: 0, activated: 0 });
    expect(updateCalls).toHaveLength(0);
  });
});
