// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// `@/db` mockado para o import de topo de `lib/team/queries` não abrir
// conexão nenhuma. Banco sempre mockado — CLAUDE.md.
vi.mock("@/db", () => ({ db: {}, pool: { end: vi.fn() } }));

import { MIN_PRICE_CENTS } from "@/lib/scoring/pricing";
import { resolvePlayer } from "@/lib/vlr/persist/players";

type Call = { op: string; payload: unknown };

const SCRAPED = {
  vlrId: "30395",
  nickname: "edith",
  team: "FlyQuest RED",
  realName: "Edith Doe",
  country: "us",
  agents: ["Neon", "Jett"],
};

/** Um jogador já no banco, achado pelo `vlrId`. */
function existing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "existing",
    nickname: "edith",
    realName: null,
    country: null,
    needsReview: false,
    ...overrides,
  };
}

/**
 * `tx` falso no padrão de `db/close-round.test.ts`, gravando cada chamada.
 *
 * `transaction` está aqui de propósito: é o **SAVEPOINT** do Postgres, e é ele
 * que permite sobreviver a uma violação de `UNIQUE` sem abortar a transação da
 * partida. Sem modelar isso, o teste daria confiança falsa — no banco de
 * verdade o comando seguinte falharia com `25P02`.
 */
function createTxStub(opts: {
  byVlrId?: Record<string, unknown> | null;
  byNickname?: Record<string, unknown> | null;
  insertError?: unknown;
}) {
  const calls: Call[] = [];
  const findFirst = vi
    .fn()
    .mockResolvedValueOnce(opts.byVlrId ?? undefined)
    .mockResolvedValueOnce(opts.byNickname ?? undefined);

  let insertAttempts = 0;

  const tx = {
    query: { player: { findFirst } },
    transaction: async (cb: (sp: unknown) => Promise<unknown>) => {
      calls.push({ op: "savepoint", payload: null });
      return cb(tx);
    },
    update: () => ({
      set: (values: unknown) => ({
        where: () => {
          calls.push({ op: "update:player", payload: values });
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: (values: unknown) => ({
        returning: async () => {
          insertAttempts += 1;
          calls.push({ op: "insert:player", payload: values });
          // O erro só vale para a primeira tentativa: a segunda é a do sufixo.
          if (opts.insertError && insertAttempts === 1) throw opts.insertError;
          return [{ id: `player-${insertAttempts}` }];
        },
      }),
    }),
  };

  const inserts = () => calls.filter((call) => call.op === "insert:player");
  const updates = () => calls.filter((call) => call.op === "update:player");

  return { tx, calls, findFirst, inserts, updates };
}

/** O formato real: o Drizzle embrulha o erro do `pg` e o pendura em `cause`. */
const UNIQUE_VIOLATION = Object.assign(new Error("Failed query: insert ..."), {
  cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolvePlayer", () => {
  it("1º degrau: o vlrId bate — é ele, e os dados são atualizados", async () => {
    const { tx, calls, updates } = createTxStub({ byVlrId: existing() });

    const result = await resolvePlayer(tx as never, SCRAPED);

    expect(result).toEqual({
      id: "existing",
      created: false,
      needsReview: false,
    });
    // Nickname inalterado: nem gasta savepoint.
    expect(calls.every((call) => call.op !== "savepoint")).toBe(true);
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payload).toEqual({
      team: "FlyQuest RED",
      realName: "Edith Doe",
      country: "us",
    });
  });

  it("trocar de nickname acontece num savepoint — colidir não derruba a partida", async () => {
    const { tx, calls, updates } = createTxStub({
      byVlrId: existing({ nickname: "nick-antigo" }),
    });

    await resolvePlayer(tx as never, SCRAPED);

    expect(calls[0].op).toBe("savepoint");
    expect(updates()[0].payload).toEqual({ nickname: "edith" });
  });

  it("2º degrau: ADOTA o registro do seed quando o nickname bate e o vlrId é nulo", async () => {
    const { tx, updates, inserts } = createTxStub({
      byVlrId: null,
      byNickname: existing({ id: "seeded" }),
    });

    const result = await resolvePlayer(tx as never, SCRAPED);

    // Adotar preserva id, preço, pontuação e — o que mais importa — as
    // escalações que já contêm esse jogador.
    expect(result).toEqual({
      id: "seeded",
      created: false,
      needsReview: false,
    });
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payload).toMatchObject({
      vlrId: "30395",
      team: "FlyQuest RED",
    });
    expect(inserts()).toHaveLength(0);
  });

  it("3º degrau: cria com needsReview e fora do mercado quando nada bate", async () => {
    const { tx, calls, inserts } = createTxStub({
      byVlrId: null,
      byNickname: null,
    });

    const result = await resolvePlayer(tx as never, SCRAPED);

    expect(result).toEqual({
      id: "player-1",
      created: true,
      needsReview: true,
    });
    // O insert de criação roda dentro de um savepoint.
    expect(calls[0].op).toBe("savepoint");
    expect(inserts()[0].payload).toMatchObject({
      vlrId: "30395",
      nickname: "edith",
      // Neon e Jett são duelistas: a função sai do agente mais jogado.
      role: "Duelista",
      active: false,
      needsReview: true,
      priceCents: MIN_PRICE_CENTS,
    });
  });

  it("um jogador só com agentes desconhecidos ainda entra, sinalizado", async () => {
    const { tx, inserts } = createTxStub({ byVlrId: null, byNickname: null });

    await resolvePlayer(tx as never, { ...SCRAPED, agents: ["Agente Novo"] });

    // O agente desconhecido é preservado (é o dado real do scoreboard); o
    // que cai no default é a **função**, e por isso a linha sai sinalizada.
    expect(inserts()[0].payload).toMatchObject({
      role: "Duelista",
      needsReview: true,
      agent: "Agente Novo",
    });
  });

  it("uma linha sem agente nenhum não grava `agent` vazio", async () => {
    const { tx, inserts } = createTxStub({ byVlrId: null, byNickname: null });

    // `agent` é NOT NULL e a UI o exibe: string vazia seria um buraco na tela.
    await resolvePlayer(tx as never, { ...SCRAPED, agents: [] });

    expect(inserts()[0].payload).toMatchObject({ agent: "Desconhecido" });
  });

  it("colisão de nickname entre vlrIds diferentes não derruba o job: sufixa e sinaliza", async () => {
    const { tx, calls, inserts } = createTxStub({
      byVlrId: null,
      byNickname: null,
      insertError: UNIQUE_VIOLATION,
    });

    const result = await resolvePlayer(tx as never, SCRAPED);

    expect(result.created).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(inserts()).toHaveLength(2);
    expect(inserts()[1].payload).toMatchObject({ nickname: "edith (30395)" });
    // A tentativa que viola tem de estar dentro do savepoint: é isso que
    // mantém a transação da partida viva para o insert seguinte.
    expect(calls[0].op).toBe("savepoint");
  });

  it("um erro que não é violação de unique sobe — não vira jogador duplicado", async () => {
    const { tx } = createTxStub({
      byVlrId: null,
      byNickname: null,
      insertError: new Error("conexão perdida"),
    });

    await expect(resolvePlayer(tx as never, SCRAPED)).rejects.toThrow(
      "conexão perdida",
    );
  });

  it("NUNCA duplica: com o vlrId conhecido, não chega a consultar por nickname", async () => {
    const { tx, findFirst } = createTxStub({ byVlrId: existing() });

    await resolvePlayer(tx as never, SCRAPED);

    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
