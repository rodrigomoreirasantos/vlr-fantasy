// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  evaluateMarketCandidates,
  filterAndSortMarketCandidates,
} from "@/lib/market/ordering";
import type { SubstitutionContext } from "@/lib/market/eligibility";
import type { Player } from "@/lib/team/types";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "tenz",
    nickname: "TenZ",
    team: "SENTINELS",
    agent: "Jett",
    role: "Duelista",
    score: 18.2,
    priceCents: 5000,
    formPoints: null,
    active: true,
    availability: "available",
    availabilityNote: null,
    region: "americas",
    photoUrl: null,
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<SubstitutionContext> = {},
): SubstitutionContext {
  return {
    marketOpen: true,
    lockedTeams: [],
    balanceCents: 10_000,
    outgoing: null,
    rosteredPlayerIds: [],
    scope: { kind: "region", region: "americas" },
    ...overrides,
  };
}

/** Atalho para os testes: avalia e já filtra/ordena numa chamada só. */
function buildList(
  candidates: readonly Player[],
  ctx: SubstitutionContext,
  options?: {
    query?: string;
    order?: "price-desc" | "price-asc" | "alphabetical";
  },
) {
  return filterAndSortMarketCandidates(
    evaluateMarketCandidates(candidates, ctx),
    options,
  );
}

describe("filterAndSortMarketCandidates — ordenação", () => {
  it("padrão (price-desc): ordena do mais caro para o mais barato", () => {
    const candidates = [
      makePlayer({ id: "caro", nickname: "Caro", priceCents: 3000 }),
      makePlayer({ id: "barato", nickname: "Barato", priceCents: 1000 }),
      makePlayer({ id: "medio", nickname: "Medio", priceCents: 2000 }),
    ];

    const sorted = buildList(candidates, makeContext());

    expect(sorted.map((c) => c.player.nickname)).toEqual([
      "Caro",
      "Medio",
      "Barato",
    ]);
  });

  it("price-asc: ordena do mais barato para o mais caro", () => {
    const candidates = [
      makePlayer({ id: "caro", nickname: "Caro", priceCents: 3000 }),
      makePlayer({ id: "barato", nickname: "Barato", priceCents: 1000 }),
      makePlayer({ id: "medio", nickname: "Medio", priceCents: 2000 }),
    ];

    const sorted = buildList(candidates, makeContext(), { order: "price-asc" });

    expect(sorted.map((c) => c.player.nickname)).toEqual([
      "Barato",
      "Medio",
      "Caro",
    ]);
  });

  it("empurra quem está bloqueado para o fim, mantendo a ordem de preço", () => {
    const candidates = [
      makePlayer({
        id: "bloqueado-barato",
        nickname: "BloqueadoBarato",
        priceCents: 1000,
        active: false, // bloqueado: player-inactive
      }),
      makePlayer({ id: "livre-caro", nickname: "LivreCaro", priceCents: 3000 }),
      makePlayer({
        id: "livre-barato",
        nickname: "LivreBarato",
        priceCents: 500,
      }),
      makePlayer({
        id: "bloqueado-caro",
        nickname: "BloqueadoCaro",
        priceCents: 9000,
        active: false,
      }),
    ];

    const sorted = buildList(candidates, makeContext());

    expect(sorted.map((c) => c.player.nickname)).toEqual([
      "LivreCaro",
      "LivreBarato",
      "BloqueadoCaro",
      "BloqueadoBarato",
    ]);
  });

  it("desempata preço igual por nickname", () => {
    const candidates = [
      makePlayer({ id: "z", nickname: "Zeta", priceCents: 1000 }),
      makePlayer({ id: "a", nickname: "Alfa", priceCents: 1000 }),
    ];

    const sorted = buildList(candidates, makeContext());

    expect(sorted.map((c) => c.player.nickname)).toEqual(["Alfa", "Zeta"]);
  });

  it("alphabetical: ignora o preço, ordena por nickname (A-Z)", () => {
    const candidates = [
      makePlayer({ id: "z", nickname: "Zeta", priceCents: 1000 }),
      makePlayer({ id: "c", nickname: "Caro", priceCents: 3000 }),
      makePlayer({ id: "a", nickname: "Alfa", priceCents: 2000 }),
    ];

    const sorted = buildList(candidates, makeContext(), {
      order: "alphabetical",
    });

    expect(sorted.map((c) => c.player.nickname)).toEqual([
      "Alfa",
      "Caro",
      "Zeta",
    ]);
  });

  it("alphabetical: bloqueados continuam empurrados para o fim", () => {
    const candidates = [
      makePlayer({
        id: "bloqueado",
        nickname: "Abloqueado",
        active: false, // bloqueado: player-inactive
      }),
      makePlayer({ id: "zeta", nickname: "Zeta" }),
    ];

    const sorted = buildList(candidates, makeContext(), {
      order: "alphabetical",
    });

    expect(sorted.map((c) => c.player.nickname)).toEqual([
      "Zeta",
      "Abloqueado",
    ]);
  });

  it("as três ordens produzem três permutações distintas", () => {
    const candidates = [
      makePlayer({ id: "a", nickname: "Alfa", priceCents: 2000 }),
      makePlayer({ id: "b", nickname: "Bravo", priceCents: 3000 }),
      makePlayer({ id: "c", nickname: "Charlie", priceCents: 1000 }),
    ];
    const ctx = makeContext();

    const desc = buildList(candidates, ctx, { order: "price-desc" }).map(
      (c) => c.player.nickname,
    );
    const asc = buildList(candidates, ctx, { order: "price-asc" }).map(
      (c) => c.player.nickname,
    );
    const alpha = buildList(candidates, ctx, { order: "alphabetical" }).map(
      (c) => c.player.nickname,
    );

    expect(desc).toEqual(["Bravo", "Alfa", "Charlie"]);
    expect(asc).toEqual(["Charlie", "Alfa", "Bravo"]);
    expect(alpha).toEqual(["Alfa", "Bravo", "Charlie"]);
  });
});

describe("evaluateMarketCandidates — o pedido do filtro: mercado fechado some", () => {
  it("candidato de organização travada (market-closed) some da lista", () => {
    const candidates = [
      makePlayer({ id: "travado", nickname: "Travado", team: "FNATIC" }),
      makePlayer({ id: "livre", nickname: "Livre", team: "SENTINELS" }),
    ];
    const ctx = makeContext({ lockedTeams: ["FNATIC"] });

    const evaluated = evaluateMarketCandidates(candidates, ctx);

    expect(evaluated.map((c) => c.player.nickname)).toEqual(["Livre"]);
  });

  it("os outros seis motivos continuam visíveis, bloqueados, no fim", () => {
    const insufficientBalance = makePlayer({
      id: "caro",
      nickname: "Caro",
      priceCents: 1_000_000,
    });
    const alreadyRostered = makePlayer({
      id: "rostered",
      nickname: "Rostered",
    });
    const samePlayer = makePlayer({ id: "outgoing", nickname: "Outgoing" });
    const playerInactive = makePlayer({
      id: "inativo",
      nickname: "Inativo",
      active: false,
    });
    const outOfRegion = makePlayer({
      id: "fora",
      nickname: "ForaDaRegiao",
      region: "emea",
    });

    const ctx = makeContext({
      outgoing: samePlayer,
      rosteredPlayerIds: [alreadyRostered.id],
    });
    const evaluated = evaluateMarketCandidates(
      [
        insufficientBalance,
        alreadyRostered,
        samePlayer,
        playerInactive,
        outOfRegion,
      ],
      ctx,
    );
    const reasons = new Map(
      evaluated.map((c) => [c.player.nickname, c.verdict.blockedBy]),
    );

    expect(reasons.get("Caro")).toBe("insufficient-balance");
    expect(reasons.get("Rostered")).toBe("already-rostered");
    expect(reasons.get("Outgoing")).toBe("same-player");
    expect(reasons.get("Inativo")).toBe("player-inactive");
    expect(reasons.get("ForaDaRegiao")).toBe("out-of-region");
    expect(evaluated).toHaveLength(5); // nenhum some — só "market-closed" some
  });

  it("sem-rodada é motivo à parte (no-round), coberto pelo teste de regressão abaixo", () => {
    const candidate = makePlayer({ id: "qualquer", nickname: "Qualquer" });
    const evaluated = evaluateMarketCandidates(
      [candidate],
      makeContext({ marketOpen: false }),
    );
    expect(evaluated[0]?.verdict.blockedBy).toBe("no-round");
  });

  it("regressão de precedência: sem rodada ativa, ninguém é market-closed — a lista não esvazia", () => {
    // eligibility.ts avalia `no-round` ANTES de `market-closed`. Se essa
    // ordem um dia inverter, este teste falha primeiro que o mercado sumir
    // sem explicação em produção.
    const candidates = [
      makePlayer({ id: "travado", nickname: "Travado", team: "FNATIC" }),
      makePlayer({ id: "livre", nickname: "Livre", team: "SENTINELS" }),
    ];
    const ctx = makeContext({ marketOpen: false, lockedTeams: ["FNATIC"] });

    const evaluated = evaluateMarketCandidates(candidates, ctx);

    expect(evaluated.map((c) => c.player.nickname)).toEqual([
      "Travado",
      "Livre",
    ]);
    expect(evaluated.every((c) => c.verdict.blockedBy === "no-round")).toBe(
      true,
    );
  });

  it("guard do outgoing travado: nada some, mesmo com todo candidato virando market-closed", () => {
    // `evaluateSubstitution` cobre os dois lados da troca: se quem SAI está
    // travado, todo `incoming` recebe "market-closed". Sem o guard, isso
    // esvaziaria as quatro abas.
    const outgoing = makePlayer({ id: "sai", nickname: "Sai", team: "FNATIC" });
    const candidates = [
      makePlayer({ id: "a", nickname: "Alfa", team: "SENTINELS" }),
      makePlayer({ id: "b", nickname: "Bravo", team: "LOUD" }),
    ];
    const ctx = makeContext({ outgoing, lockedTeams: ["FNATIC"] });

    const evaluated = evaluateMarketCandidates(candidates, ctx);

    expect(evaluated).toHaveLength(2);
    expect(
      evaluated.every((c) => c.verdict.blockedBy === "market-closed"),
    ).toBe(true);
  });
});

describe("filterAndSortMarketCandidates — busca por nome", () => {
  const candidates = [
    makePlayer({ id: "a", nickname: "Aspas" }),
    makePlayer({ id: "s", nickname: "Sacy" }),
    makePlayer({ id: "n", nickname: "Não" }),
  ];

  it("substring no meio do nickname casa", () => {
    const result = buildList(candidates, makeContext(), { query: "spa" });
    expect(result.map((c) => c.player.nickname)).toEqual(["Aspas"]);
  });

  it("ignora caixa", () => {
    const result = buildList(candidates, makeContext(), { query: "SACY" });
    expect(result.map((c) => c.player.nickname)).toEqual(["Sacy"]);
  });

  it("ignora acento nos dois sentidos", () => {
    expect(
      buildList(candidates, makeContext(), { query: "nao" }).map(
        (c) => c.player.nickname,
      ),
    ).toEqual(["Não"]);
  });

  it("termo vazio ou só espaços devolve tudo", () => {
    expect(buildList(candidates, makeContext(), { query: "" })).toHaveLength(3);
    expect(buildList(candidates, makeContext(), { query: "   " })).toHaveLength(
      3,
    );
  });

  it("termo sem match devolve lista vazia", () => {
    expect(buildList(candidates, makeContext(), { query: "zzz" })).toHaveLength(
      0,
    );
  });

  it("busca não quebra a regra de bloqueados por último", () => {
    const mixed = [
      makePlayer({ id: "a", nickname: "Alfredo", active: false }),
      makePlayer({ id: "b", nickname: "Alberto" }),
    ];

    const result = buildList(mixed, makeContext(), { query: "al" });

    expect(result.map((c) => c.player.nickname)).toEqual([
      "Alberto",
      "Alfredo",
    ]);
  });
});
