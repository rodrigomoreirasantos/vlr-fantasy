import {
  evaluateSubstitution,
  type SubstitutionContext,
} from "@/lib/market/eligibility";
import type { Player } from "@/lib/team/types";

/**
 * As duas ordens que o `<MarketSheet>` oferece — `"price"` é o padrão.
 * `"alphabetical"` ordena por nickname (A-Z); em ambas, quem está bloqueado
 * vai para o fim (ver `sortMarketCandidates`).
 */
export type MarketSortOrder = "price" | "alphabetical";

/**
 * Ordem de exibição do mercado. Em qualquer uma das duas ordens, quem está
 * bloqueado (sem saldo, já escalado, indisponível) vai para o fim — isso não
 * muda com `order`, só o critério entre os elegíveis muda:
 *
 * - `"price"` (padrão): do mais barato para o mais caro, com nickname como
 *   desempate de preço igual;
 * - `"alphabetical"`: por nickname (A-Z).
 *
 * Em ambos os casos a ordem é estável entre renders e idêntica no servidor e
 * no cliente. Reusa `evaluateSubstitution` para decidir quem está
 * bloqueado — nunca reimplementar essa regra aqui.
 */
export function sortMarketCandidates(
  candidates: readonly Player[],
  ctx: SubstitutionContext,
  order: MarketSortOrder = "price",
): Player[] {
  return [...candidates].sort((a, b) => {
    const aBlocked = evaluateSubstitution(ctx, a).blockedBy !== null;
    const bBlocked = evaluateSubstitution(ctx, b).blockedBy !== null;
    if (aBlocked !== bBlocked) return Number(aBlocked) - Number(bBlocked);
    if (order === "alphabetical") {
      return a.nickname.localeCompare(b.nickname);
    }
    if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
    return a.nickname.localeCompare(b.nickname);
  });
}
