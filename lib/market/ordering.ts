import {
  evaluateSubstitution,
  type SubstitutionContext,
} from "@/lib/market/eligibility";
import type { Player } from "@/lib/team/types";

/**
 * Ordem de exibição do mercado: quem o usuário pode contratar primeiro, do
 * mais barato para o mais caro; quem está bloqueado (sem saldo, já escalado,
 * indisponível) depois, na mesma ordem de preço. Empate de preço desempata
 * por nickname, para a ordem ser estável entre renders e idêntica no
 * servidor e no cliente.
 *
 * Reusa `evaluateSubstitution` para decidir quem está bloqueado — nunca
 * reimplementar essa regra aqui.
 */
export function sortMarketCandidates(
  candidates: readonly Player[],
  ctx: SubstitutionContext,
): Player[] {
  return [...candidates].sort((a, b) => {
    const aBlocked = evaluateSubstitution(ctx, a).blockedBy !== null;
    const bBlocked = evaluateSubstitution(ctx, b).blockedBy !== null;
    if (aBlocked !== bBlocked) return Number(aBlocked) - Number(bBlocked);
    if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
    return a.nickname.localeCompare(b.nickname);
  });
}
