import { isTeamLocked } from "@/lib/market/lock";
import type { MarketScope } from "@/lib/market/scope";
import { matchesScope } from "@/lib/market/scope";
import type { Player } from "@/lib/team/types";

export type BlockReason =
  | "no-round"
  | "market-closed"
  | "player-inactive"
  | "same-player"
  | "already-rostered"
  | "out-of-region"
  | "insufficient-balance";

export type SubstitutionContext = {
  /**
   * Há rodada ativa para registrar a transferência. Não é mais a janela da
   * rodada: quem tranca é `lockedTeams`, campeonato a campeonato.
   */
  marketOpen: boolean;
  /**
   * As organizações cujo mercado já fechou hoje (`lockedOrganizations`). A
   * troca é barrada se **qualquer um dos dois lados** estiver travado: vender
   * quem já vai entrar em quadra e comprar quem já vai entrar em quadra são a
   * mesma jogada, vista de pontas diferentes.
   */
  lockedTeams: readonly string[];
  balanceCents: number;
  /**
   * Quem deixa a vaga — define o crédito da venda que abate o custo da
   * contratação. `null` numa vaga vazia: não há crédito, e o custo da
   * contratação é o preço cheio do candidato. Qualquer função é aceita em
   * qualquer vaga — o usuário pode escalar cinco Duelistas se quiser.
   */
  outgoing: Player | null;
  rosteredPlayerIds: readonly string[];
  /**
   * O recorte do time (região ou organizações classificadas) —
   * `.claude/plans/10-time-por-regiao.md`. Um candidato fora dele nunca entra
   * por substituição, mesmo que já esteja escalado noutro time do usuário.
   */
  scope: MarketScope;
};

export type Verdict = {
  /** incoming.priceCents - outgoing.priceCents (pode ser negativo). */
  netCostCents: number;
  balanceAfterCents: number;
  blockedBy: BlockReason | null;
};

const REASON_LABELS: Record<BlockReason, string> = {
  "no-round": "Sem rodada",
  "market-closed": "Mercado fechado",
  "player-inactive": "Indisponível",
  "same-player": "Já é seu",
  "already-rostered": "Já escalado",
  "out-of-region": "Fora da região",
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
 * no-round → market-closed → player-inactive → same-player →
 * already-rostered → out-of-region → insufficient-balance.
 *
 * `out-of-region` vem **depois** de `same-player`/`already-rostered`: um
 * jogador que mudou de liga pode continuar escalado (decisão 7 do plano —
 * nunca vendemos ninguém sozinhos), então "já é seu"/"já escalado" são
 * respostas mais verdadeiras que "fora da região" para ele.
 *
 * `market-closed` cobre os dois lados da troca: o mercado do campeonato de
 * quem entra e o do campeonato de quem sai. Basta um deles ter fechado hoje.
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
    if (!ctx.marketOpen) return "no-round";
    if (isTeamLocked(ctx.lockedTeams, incoming.team)) return "market-closed";
    if (ctx.outgoing && isTeamLocked(ctx.lockedTeams, ctx.outgoing.team)) {
      return "market-closed";
    }
    if (!incoming.active) return "player-inactive";
    if (ctx.outgoing && incoming.id === ctx.outgoing.id) return "same-player";
    if (ctx.rosteredPlayerIds.includes(incoming.id)) return "already-rostered";
    if (!matchesScope(ctx.scope, incoming)) return "out-of-region";
    // Fronteira exata: gastar o saldo todo é permitido.
    if (netCostCents > ctx.balanceCents) return "insufficient-balance";
    return null;
  })();

  return { netCostCents, balanceAfterCents, blockedBy };
}

/**
 * Teto de compra: o maior preço que um candidato pode ter sem cair em
 * `"insufficient-balance"`. Não é conta nova — é a mesma que
 * `evaluateSubstitution` usa (`netCostCents > ctx.balanceCents`, com
 * `netCostCents = incoming.priceCents - outgoing.priceCents`), isolada com
 * nome para a UI mostrar "quanto dá para gastar" sem duplicar a aritmética.
 */
export function spendingCapCents(
  balanceCents: number,
  outgoing: Player | null,
): number {
  return balanceCents + (outgoing?.priceCents ?? 0);
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
  blockedBy: "no-round" | "market-closed" | null;
};

/**
 * Vender `outgoing` sem contratar ninguém no lugar: a vaga fica vazia e o
 * preço cheio do jogador é creditado no saldo. Único bloqueio possível é o
 * mercado fechado — vender não tem função exigida, não olha região (decisão
 * 7: um jogador fora de região continua vendível) nem checagem de saldo
 * (é sempre crédito, nunca custo).
 */
export function evaluateSale(
  ctx: {
    marketOpen: boolean;
    lockedTeams: readonly string[];
    balanceCents: number;
  },
  outgoing: Player,
): SaleVerdict {
  const proceedsCents = outgoing.priceCents;
  const blockedBy = !ctx.marketOpen
    ? ("no-round" as const)
    : isTeamLocked(ctx.lockedTeams, outgoing.team)
      ? ("market-closed" as const)
      : null;

  return {
    proceedsCents,
    balanceAfterCents: ctx.balanceCents + proceedsCents,
    blockedBy,
  };
}

export function blockReasonLabel(reason: BlockReason): string {
  return REASON_LABELS[reason];
}

export function blockReasonMessage(reason: BlockReason): string {
  switch (reason) {
    case "no-round":
      return "Não há rodada ativa no momento.";
    case "market-closed":
      return "O mercado deste campeonato já fechou — ele joga hoje.";
    case "player-inactive":
      return "Este jogador não está disponível nesta rodada.";
    case "same-player":
      return "Este jogador já ocupa essa vaga.";
    case "already-rostered":
      return "Este jogador já está no seu time.";
    case "out-of-region":
      return "Este jogador não atua na região deste time.";
    case "insufficient-balance":
      return "Saldo insuficiente para esta contratação.";
  }
}
