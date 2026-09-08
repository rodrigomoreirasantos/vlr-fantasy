import { describe, expect, it } from "vitest";

import {
  blockReasonMessage,
  canSubstitute,
  evaluateSale,
  evaluateSubstitution,
  type SubstitutionContext,
} from "@/lib/market/eligibility";
import type { MarketScope } from "@/lib/market/scope";
import type { Player } from "@/lib/team/types";

const AMERICAS_SCOPE: MarketScope = { kind: "region", region: "americas" };

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "tenz",
    nickname: "TenZ",
    team: "SENTINELS",
    agent: "Jett",
    role: "Duelista",
    score: 18.2,
    priceCents: 5000,
    active: true,
    availability: "available",
    availabilityNote: null,
    region: "americas",
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
    outgoing: makePlayer({ id: "derke", nickname: "Derke", priceCents: 4000 }),
    rosteredPlayerIds: ["derke"],
    scope: AMERICAS_SCOPE,
    ...overrides,
  };
}

describe("evaluateSubstitution — precedência", () => {
  it("sem rodada ativa vence qualquer outra checagem", () => {
    const ctx = makeContext({ marketOpen: false });
    const incoming = makePlayer({ id: "chronicle", role: "Sentinela" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("no-round");
  });

  it("a trava do dia vem logo depois, antes de saldo e função", () => {
    const ctx = makeContext({ lockedTeams: ["FNATIC"], balanceCents: 0 });
    const incoming = makePlayer({ id: "boaster", team: "FNATIC" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("market-closed");
  });

  it("mesmo jogador vence já escalado", () => {
    const ctx = makeContext({ rosteredPlayerIds: ["derke"] });
    const incoming = makePlayer({ id: "derke", priceCents: 4000 });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("same-player");
  });

  it("já escalado é detectado para um jogador diferente do que sai", () => {
    const ctx = makeContext({ rosteredPlayerIds: ["derke", "tenz"] });
    const incoming = makePlayer({ id: "tenz" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe(
      "already-rostered",
    );
  });
});

describe("evaluateSubstitution — saldo", () => {
  it("libera quando o custo líquido é exatamente igual ao saldo", () => {
    const ctx = makeContext({ balanceCents: 1000 });
    const incoming = makePlayer({ id: "tenz", priceCents: 5000 }); // outgoing custa 4000 → líquido 1000

    const verdict = evaluateSubstitution(ctx, incoming);
    expect(verdict.netCostCents).toBe(1000);
    expect(verdict.blockedBy).toBeNull();
    expect(verdict.balanceAfterCents).toBe(0);
  });

  it("bloqueia quando o custo líquido excede o saldo em 1 centavo", () => {
    const ctx = makeContext({ balanceCents: 999 });
    const incoming = makePlayer({ id: "tenz", priceCents: 5000 }); // líquido 1000 > 999

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe(
      "insufficient-balance",
    );
  });

  it("o crédito da venda de quem sai reduz o custo líquido", () => {
    const ctx = makeContext({
      balanceCents: 100,
      outgoing: makePlayer({ id: "derke", priceCents: 9000 }),
    });
    const incoming = makePlayer({ id: "tenz", priceCents: 9050 });

    const verdict = evaluateSubstitution(ctx, incoming);
    expect(verdict.netCostCents).toBe(50);
    expect(verdict.blockedBy).toBeNull();
  });

  it("trocar por alguém mais barato aumenta o saldo resultante", () => {
    const ctx = makeContext({
      balanceCents: 1000,
      outgoing: makePlayer({ id: "derke", priceCents: 9000 }),
    });
    const incoming = makePlayer({ id: "tenz", priceCents: 3000 });

    const verdict = evaluateSubstitution(ctx, incoming);
    expect(verdict.netCostCents).toBe(-6000);
    expect(verdict.balanceAfterCents).toBe(7000);
    expect(verdict.blockedBy).toBeNull();
  });
});

describe("canSubstitute", () => {
  it("reflete o mesmo veredito de evaluateSubstitution", () => {
    const ctx = makeContext();
    const incoming = makePlayer({ id: "tenz", priceCents: 3000 });

    expect(canSubstitute(ctx, incoming)).toBe(true);
    expect(
      canSubstitute(ctx, makePlayer({ id: "derke", priceCents: 3000 })),
    ).toBe(false); // já escalado — é quem sai da própria vaga
  });

  it("libera qualquer função, incluindo repetida", () => {
    const ctx = makeContext();
    const incoming = makePlayer({ id: "chronicle", role: "Sentinela" });

    expect(canSubstitute(ctx, incoming)).toBe(true);
  });
});

describe("blockReasonMessage", () => {
  it("descreve cada motivo de bloqueio em português", () => {
    expect(blockReasonMessage("market-closed")).toBe(
      "O mercado deste campeonato já fechou — ele joga hoje.",
    );
    expect(blockReasonMessage("no-round")).toBe(
      "Não há rodada ativa no momento.",
    );
    expect(blockReasonMessage("already-rostered")).toBe(
      "Este jogador já está no seu time.",
    );
  });
});

describe("evaluateSubstitution — vaga vazia (outgoing null)", () => {
  it("o custo líquido é o preço cheio do candidato", () => {
    const ctx = makeContext({ outgoing: null, balanceCents: 10_000 });
    const incoming = makePlayer({ id: "tenz", priceCents: 5000 });

    const verdict = evaluateSubstitution(ctx, incoming);
    expect(verdict.netCostCents).toBe(5000);
    expect(verdict.balanceAfterCents).toBe(5000);
    expect(verdict.blockedBy).toBeNull();
  });

  it("libera qualquer função — vaga vazia não exige nenhuma", () => {
    const ctx = makeContext({ outgoing: null, rosteredPlayerIds: [] });
    const incoming = makePlayer({ id: "chronicle", role: "Sentinela" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBeNull();
  });

  it("ainda bloqueia um candidato já escalado", () => {
    const ctx = makeContext({ outgoing: null, rosteredPlayerIds: ["tenz"] });
    const incoming = makePlayer({ id: "tenz" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe(
      "already-rostered",
    );
  });

  it("fronteira exata de saldo: preço igual ao saldo libera, um centavo a mais bloqueia", () => {
    const incoming = makePlayer({ id: "tenz", priceCents: 5000 });

    expect(
      evaluateSubstitution(
        makeContext({ outgoing: null, balanceCents: 5000 }),
        incoming,
      ).blockedBy,
    ).toBeNull();

    expect(
      evaluateSubstitution(
        makeContext({ outgoing: null, balanceCents: 4999 }),
        incoming,
      ).blockedBy,
    ).toBe("insufficient-balance");
  });
});

describe("evaluateSubstitution — fora da região", () => {
  it("bloqueia um candidato de outra região, mesmo com saldo sobrando", () => {
    const ctx = makeContext({ balanceCents: 10_000 });
    const incoming = makePlayer({ id: "boaster", region: "emea" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("out-of-region");
  });

  it("libera um candidato da mesma região", () => {
    const ctx = makeContext();
    const incoming = makePlayer({ id: "chronicle", region: "americas" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBeNull();
  });

  it("já escalado vence fora-da-região — 'já é seu' é mais verdadeiro", () => {
    const ctx = makeContext({ rosteredPlayerIds: ["derke", "tenz"] });
    const incoming = makePlayer({ id: "tenz", region: "emea" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe(
      "already-rostered",
    );
  });

  it("mesmo jogador (a própria vaga) vence fora-da-região", () => {
    const ctx = makeContext({
      outgoing: makePlayer({ id: "derke", region: "emea" }),
    });
    const incoming = makePlayer({ id: "derke", region: "emea" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("same-player");
  });

  it("fora da região vence saldo insuficiente", () => {
    const ctx = makeContext({ balanceCents: 0 });
    const incoming = makePlayer({
      id: "boaster",
      region: "emea",
      priceCents: 999_999,
    });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("out-of-region");
  });

  it("escopo por organizações (time Internacional): candidato de fora não passa", () => {
    const ctx = makeContext({
      scope: { kind: "organizations", organizations: ["LOUD", "FNATIC"] },
    });
    const incoming = makePlayer({ id: "boaster", team: "DRX" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("out-of-region");
  });

  it("escopo por organizações: candidato classificado passa", () => {
    const ctx = makeContext({
      scope: { kind: "organizations", organizations: ["LOUD", "FNATIC"] },
    });
    const incoming = makePlayer({ id: "boaster", team: "FNATIC" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBeNull();
  });
});

describe("evaluateSale", () => {
  it("credita o preço cheio de quem sai, mesmo com saldo zerado", () => {
    const outgoing = makePlayer({ id: "derke", priceCents: 4000 });

    const verdict = evaluateSale(
      { marketOpen: true, lockedTeams: [], balanceCents: 0 },
      outgoing,
    );

    expect(verdict.proceedsCents).toBe(4000);
    expect(verdict.balanceAfterCents).toBe(4000);
    expect(verdict.blockedBy).toBeNull();
  });

  it("sem rodada ativa, nada se move", () => {
    const outgoing = makePlayer({ id: "derke", priceCents: 4000 });

    const verdict = evaluateSale(
      { marketOpen: false, lockedTeams: [], balanceCents: 10_000 },
      outgoing,
    );

    expect(verdict.blockedBy).toBe("no-round");
  });
});

describe("evaluateSubstitution — a trava do dia", () => {
  it("não dá para comprar quem já entrou na janela fechada", () => {
    const ctx = makeContext({ lockedTeams: ["FNATIC"] });
    const incoming = makePlayer({ id: "boaster", team: "FNATIC" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("market-closed");
  });

  it("nem vender: os dois lados da troca contam", () => {
    const ctx = makeContext({
      lockedTeams: ["SENTINELS"],
      outgoing: makePlayer({ id: "zekken", team: "SENTINELS" }),
    });
    const incoming = makePlayer({ id: "boaster", team: "FNATIC" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("market-closed");
  });

  it("um campeonato fechado não tranca os outros", () => {
    const ctx = makeContext({
      lockedTeams: ["DRX", "Gen.G"],
      outgoing: makePlayer({ id: "derke", team: "FNATIC" }),
    });
    const incoming = makePlayer({ id: "boaster", team: "FNATIC" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBeNull();
  });
});

describe("evaluateSale — a trava do dia", () => {
  it("vender quem já vai entrar em quadra é a mesma jogada", () => {
    const outgoing = makePlayer({ team: "SENTINELS" });

    expect(
      evaluateSale(
        { marketOpen: true, lockedTeams: ["SENTINELS"], balanceCents: 0 },
        outgoing,
      ).blockedBy,
    ).toBe("market-closed");
  });

  it("com o campeonato dele aberto, a venda passa", () => {
    const outgoing = makePlayer({ team: "SENTINELS" });

    expect(
      evaluateSale(
        { marketOpen: true, lockedTeams: ["FNATIC"], balanceCents: 0 },
        outgoing,
      ).blockedBy,
    ).toBeNull();
  });
});
