import type { Player, PlayerRole } from "@/lib/team/types";

export type BlockReason =
  | "market-closed"
  | "player-inactive"
  | "same-player"
  | "already-rostered"
  | "role-mismatch"
  | "insufficient-balance";

export type SubstitutionContext = {
  marketOpen: boolean;
  balanceCents: number;
  /** Quem deixa a vaga — define a função exigida e o crédito da venda. */
  outgoing: Player;
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
  "role-mismatch": "Outra função",
  "insufficient-balance": "Sem saldo",
};

/**
 * Avalia se `incoming` pode substituir `ctx.outgoing`. É a única fonte de
 * verdade da regra: a UI a usa para decidir se o botão "Contratar" está
 * ativo, e a Server Action chama a mesma função dentro da transação, com
 * dados relidos do banco. Nunca reescrever esta regra em outro lugar.
 *
 * Precedência fixa (a primeira que casar vence) — assim o usuário nunca vê
 * "sem saldo" quando o problema real é a função:
 * market-closed → player-inactive → same-player → already-rostered →
 * role-mismatch → insufficient-balance.
 */
export function evaluateSubstitution(
  ctx: SubstitutionContext,
  incoming: Player,
): Verdict {
  const netCostCents = incoming.priceCents - ctx.outgoing.priceCents;
  const balanceAfterCents = ctx.balanceCents - netCostCents;

  const blockedBy = ((): BlockReason | null => {
    if (!ctx.marketOpen) return "market-closed";
    if (!incoming.active) return "player-inactive";
    if (incoming.id === ctx.outgoing.id) return "same-player";
    if (ctx.rosteredPlayerIds.includes(incoming.id)) return "already-rostered";
    if (incoming.role !== ctx.outgoing.role) return "role-mismatch";
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

export function blockReasonLabel(reason: BlockReason): string {
  return REASON_LABELS[reason];
}

export function blockReasonMessage(
  reason: BlockReason,
  requiredRole: PlayerRole,
): string {
  switch (reason) {
    case "market-closed":
      return "A janela de mercado está fechada.";
    case "player-inactive":
      return "Este jogador não está disponível nesta rodada.";
    case "same-player":
      return "Este jogador já ocupa essa vaga.";
    case "already-rostered":
      return "Este jogador já está no seu time.";
    case "role-mismatch":
      return `Só é possível substituir por outro ${requiredRole}.`;
    case "insufficient-balance":
      return "Saldo insuficiente para esta contratação.";
  }
}
