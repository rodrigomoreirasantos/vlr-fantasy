import type { Player } from "@/lib/team/types";

export type BlockReason =
  | "market-closed"
  | "player-inactive"
  | "same-player"
  | "already-rostered"
  | "insufficient-balance";

export type SubstitutionContext = {
  marketOpen: boolean;
  balanceCents: number;
  /**
   * Quem deixa a vaga — define o crédito da venda que abate o custo da
   * contratação. `null` numa vaga vazia: não há crédito, e o custo da
   * contratação é o preço cheio do candidato. Qualquer função é aceita em
   * qualquer vaga — o usuário pode escalar cinco Duelistas se quiser.
   */
  outgoing: Player | null;
  rosteredPlayerIds: readonly string[];
};

export type Verdict = {
  /** incoming.priceCents - outgoing.priceCents (pode ser negativo). */
  netCostCents: number;
  balanceAfterCents: number;
  blockedBy: BlockReason | null;
};

const REASON_LABELS: Record<BlockReason, string> = {
  "market-closed": "Mercado fechado",
  "player-inactive": "Indisponível",
  "same-player": "Já é seu",
  "already-rostered": "Já escalado",
  "insufficient-balance": "Sem saldo",
};

/**
 * Avalia se `incoming` pode substituir `ctx.outgoing` — ou preencher a vaga,
 * quando `ctx.outgoing` é `null`. É a única fonte de verdade da regra: a UI a
 * usa para decidir se o botão "Contratar" está ativo, e a Server Action
 * chama a mesma função dentro da transação, com dados relidos do banco.
 * Nunca reescrever esta regra em outro lugar.
 *
 * Precedência fixa (a primeira que casar vence) — assim o usuário nunca vê
 * "sem saldo" quando o problema real é outro:
 * market-closed → player-inactive → same-player → already-rostered →
 * insufficient-balance.
 *
 * `same-player` só é alcançável com `ctx.outgoing` — não há função exigida
 * em nenhum dos dois modos: o usuário pode escalar qualquer combinação de
 * funções, inclusive repetidas.
 */
export function evaluateSubstitution(
  ctx: SubstitutionContext,
  incoming: Player,
): Verdict {
  const netCostCents = incoming.priceCents - (ctx.outgoing?.priceCents ?? 0);
  const balanceAfterCents = ctx.balanceCents - netCostCents;

  const blockedBy = ((): BlockReason | null => {
    if (!ctx.marketOpen) return "market-closed";
    if (!incoming.active) return "player-inactive";
    if (ctx.outgoing && incoming.id === ctx.outgoing.id) return "same-player";
    if (ctx.rosteredPlayerIds.includes(incoming.id)) return "already-rostered";
    // Fronteira exata: gastar o saldo todo é permitido.
    if (netCostCents > ctx.balanceCents) return "insufficient-balance";
    return null;
  })();

  return { netCostCents, balanceAfterCents, blockedBy };
}

export function canSubstitute(
  ctx: SubstitutionContext,
  incoming: Player,
): boolean {
  return evaluateSubstitution(ctx, incoming).blockedBy === null;
}

export type SaleVerdict = {
  proceedsCents: number;
  balanceAfterCents: number;
  blockedBy: "market-closed" | null;
};

/**
 * Vender `outgoing` sem contratar ninguém no lugar: a vaga fica vazia e o
 * preço cheio do jogador é creditado no saldo. Único bloqueio possível é o
 * mercado fechado — vender não tem função exigida nem checagem de saldo
 * (é sempre crédito, nunca custo).
 */
export function evaluateSale(
  ctx: { marketOpen: boolean; balanceCents: number },
  outgoing: Player,
): SaleVerdict {
  const proceedsCents = outgoing.priceCents;
  return {
    proceedsCents,
    balanceAfterCents: ctx.balanceCents + proceedsCents,
    blockedBy: ctx.marketOpen ? null : "market-closed",
  };
}

export function blockReasonLabel(reason: BlockReason): string {
  return REASON_LABELS[reason];
}

export function blockReasonMessage(reason: BlockReason): string {
  switch (reason) {
    case "market-closed":
      return "A janela de mercado está fechada.";
    case "player-inactive":
      return "Este jogador não está disponível nesta rodada.";
    case "same-player":
      return "Este jogador já ocupa essa vaga.";
    case "already-rostered":
      return "Este jogador já está no seu time.";
    case "insufficient-balance":
      return "Saldo insuficiente para esta contratação.";
  }
}
