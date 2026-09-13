// @vitest-environment node
import { describe, expect, it } from "vitest";

import { listPlayerFormPoints, listRoundSeriesCounts } from "@/lib/round/queries";

/**
 * Teste de contrato (plano 20, Fase 1): `listPlayerFormPoints` não é testada
 * contra um banco real (CLAUDE.md: banco sempre mockado) — este teste prova
 * só que a consulta é montada em duas etapas (a subquery ranqueada, depois a
 * média) e que o `Map` devolvido é construído a partir das linhas que o
 * segundo `select` resolve. A regra de negócio em si (a janela de 5 séries)
 * é testada em `lib/scoring/form.test.ts`, sobre a função pura.
 */
function createQuerierStub(rows: { playerId: string; formPoints: number }[]) {
  let call = 0;

  const q = {
    select: () => {
      call += 1;

      if (call === 1) {
        // Primeira etapa: monta a subquery ranqueada (`row_number()`, `.as("ranked")`).
        const rankedChain = {
          from: () => rankedChain,
          innerJoin: () => rankedChain,
          groupBy: () => rankedChain,
          as: () => ({ playerId: "ranked.player_id", rn: "ranked.rn" }),
        };
        return rankedChain;
      }

      // Segunda etapa: filtra `rn <= FORM_WINDOW` e tira a média — resolve
      // com as linhas do teste.
      const finalChain = {
        from: () => finalChain,
        where: () => finalChain,
        groupBy: () => Promise.resolve(rows),
      };
      return finalChain;
    },
  };

  return q;
}

describe("listPlayerFormPoints", () => {
  it("monta a consulta em duas etapas e devolve um Map por jogador", async () => {
    const q = createQuerierStub([
      { playerId: "p1", formPoints: 52.1 },
      { playerId: "p2", formPoints: 80.234 },
    ]);

    const result = await listPlayerFormPoints(q as never);

    expect(result).toBeInstanceOf(Map);
    expect(result.get("p1")).toBe(52.1);
    // Arredonda para uma casa decimal.
    expect(result.get("p2")).toBe(80.2);
    expect(result.size).toBe(2);
  });

  it("sem nenhuma linha, devolve um Map vazio — não quebra", async () => {
    const q = createQuerierStub([]);

    const result = await listPlayerFormPoints(q as never);

    expect(result.size).toBe(0);
  });
});

/**
 * Teste de contrato de `listRoundSeriesCounts` (plano 26, Fase 2 —
 * `.claude/plans/26-regras-de-preco-e-saldo.md`): só prova que a consulta é
 * montada (`select().from().innerJoin().where().groupBy()`) e que o `Map`
 * devolvido vem das linhas que o `groupBy` resolve — banco sempre mockado
 * (CLAUDE.md).
 */
function createSeriesQuerierStub(rows: { playerId: string; series: number }[]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve(rows),
  };
  return { select: () => chain };
}

describe("listRoundSeriesCounts", () => {
  it("devolve um Map de playerId → número de séries na rodada", async () => {
    const q = createSeriesQuerierStub([
      { playerId: "p1", series: 1 },
      { playerId: "p2", series: 3 },
    ]);

    const result = await listRoundSeriesCounts("round-1", q as never);

    expect(result).toBeInstanceOf(Map);
    expect(result.get("p1")).toBe(1);
    expect(result.get("p2")).toBe(3);
    expect(result.size).toBe(2);
  });

  it("sem nenhuma linha (ninguém jogou), devolve um Map vazio", async () => {
    const q = createSeriesQuerierStub([]);

    const result = await listRoundSeriesCounts("round-1", q as never);

    expect(result.size).toBe(0);
  });
});
