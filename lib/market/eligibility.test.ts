import { describe, expect, it } from "vitest";

import {
  blockReasonMessage,
  canSubstitute,
  evaluateSubstitution,
  type SubstitutionContext,
} from "@/lib/market/eligibility";
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
    active: true,
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<SubstitutionContext> = {},
): SubstitutionContext {
  return {
    marketOpen: true,
    balanceCents: 10_000,
    outgoing: makePlayer({ id: "derke", nickname: "Derke", priceCents: 4000 }),
    rosteredPlayerIds: ["derke"],
    ...overrides,
  };
}

describe("evaluateSubstitution — precedência", () => {
  it("mercado fechado vence função errada", () => {
    const ctx = makeContext({ marketOpen: false });
    const incoming = makePlayer({ id: "chronicle", role: "Sentinela" });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("market-closed");
  });

  it("função errada vence saldo insuficiente", () => {
    const ctx = makeContext({ balanceCents: 0 });
    const incoming = makePlayer({
      id: "chronicle",
      role: "Sentinela",
      priceCents: 1_000_000,
    });

    expect(evaluateSubstitution(ctx, incoming).blockedBy).toBe("role-mismatch");
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
      canSubstitute(ctx, makePlayer({ id: "tenz", role: "Sentinela" })),
    ).toBe(false);
  });
});

describe("blockReasonMessage", () => {
  it("menciona a função exigida no motivo de função errada", () => {
    expect(blockReasonMessage("role-mismatch", "Controlador")).toBe(
      "Só é possível substituir por outro Controlador.",
    );
  });

  it("usa uma mensagem genérica quando não há função exigida", () => {
    expect(blockReasonMessage("role-mismatch", null)).toBe(
      "Só é possível substituir por outro jogador da mesma função.",
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

  it("libera qualquer função, sem role-mismatch", () => {
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
