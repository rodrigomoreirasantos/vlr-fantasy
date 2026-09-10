import {
  evaluateSubstitution,
  type SubstitutionContext,
  type Verdict,
} from "@/lib/market/eligibility";
import { isTeamLocked } from "@/lib/market/lock";
import { matchesSearch, normalizeSearchTerm } from "@/lib/market/search";
import type { Player } from "@/lib/team/types";

/**
 * As três ordens que o `<MarketSheet>` oferece — `"price-desc"` é o padrão
 * (o mais caro primeiro). Em qualquer uma, quem está bloqueado vai para o
 * fim (ver `filterAndSortMarketCandidates`) — isso não muda com a ordem, só
 * o critério entre os elegíveis muda.
 */
export type MarketSortOrder = "price-desc" | "price-asc" | "alphabetical";

export const DEFAULT_MARKET_SORT: MarketSortOrder = "price-desc";

/** Um candidato já julgado — o veredito viaja com ele, avaliado uma única vez. */
export type MarketCandidate = {
  player: Player;
  verdict: Verdict;
};

/**
 * Estágio 1 do pipeline do mercado: avalia cada candidato **uma vez**
 * (`evaluateSubstitution` custa uma consulta às regras de negócio, não deve
 * ser refeita a cada comparação de ordenação nem a cada tecla de busca) e
 * esconde quem está bloqueado por `"market-closed"` — o pedido do prompt de
 * filtro: jogador de organização travada não deveria nem aparecer. Os outros
 * seis motivos de bloqueio continuam na lista, visíveis.
 *
 * **Exceção deliberada:** se quem está **saindo** da vaga (`ctx.outgoing`)
 * está com a própria organização travada, TODO candidato recebe
 * `"market-closed"` (`evaluateSubstitution` cobre os dois lados da troca) —
 * escondê-los todos esvaziaria as quatro abas sem explicação. Nesse caso a
 * lista permanece inteira e bloqueada; quem chama decide como avisar o
 * usuário (o `<MarketSheet>` mostra um alerta dedicado).
 */
export function evaluateMarketCandidates(
  candidates: readonly Player[],
  ctx: SubstitutionContext,
): MarketCandidate[] {
  const outgoingLocked =
    ctx.outgoing !== null && isTeamLocked(ctx.lockedTeams, ctx.outgoing.team);

  return candidates.flatMap((player) => {
    const verdict = evaluateSubstitution(ctx, player);
    const hiddenByClosedMarket =
      verdict.blockedBy === "market-closed" && !outgoingLocked;
    return hiddenByClosedMarket ? [] : [{ player, verdict }];
  });
}

/**
 * Estágio 2: filtra pelo termo de busca e ordena — roda a cada tecla
 * digitada, sobre a lista já julgada pelo estágio 1 (não reavalia
 * elegibilidade). Bloqueados sempre por último, qualquer que seja `order`;
 * entre candidatos da mesma condição, o critério é o pedido:
 *
 * - `"price-desc"` (padrão): do mais caro para o mais barato;
 * - `"price-asc"`: do mais barato para o mais caro;
 * - `"alphabetical"`: por nickname (A-Z).
 *
 * Preço empatado desempata por nickname nas duas ordens de preço, para a
 * ordem ser estável entre renders e idêntica no servidor e no cliente.
 */
export function filterAndSortMarketCandidates(
  evaluated: readonly MarketCandidate[],
  options: { query?: string; order?: MarketSortOrder } = {},
): MarketCandidate[] {
  const { query = "", order = DEFAULT_MARKET_SORT } = options;
  const normalizedQuery = normalizeSearchTerm(query);

  const filtered = evaluated.filter((c) =>
    matchesSearch(c.player.nickname, normalizedQuery),
  );

  return filtered.sort((a, b) => {
    const aBlocked = a.verdict.blockedBy !== null;
    const bBlocked = b.verdict.blockedBy !== null;
    if (aBlocked !== bBlocked) return Number(aBlocked) - Number(bBlocked);

    if (order === "alphabetical") {
      return a.player.nickname.localeCompare(b.player.nickname, "pt-BR");
    }
    if (a.player.priceCents !== b.player.priceCents) {
      return order === "price-asc"
        ? a.player.priceCents - b.player.priceCents
        : b.player.priceCents - a.player.priceCents;
    }
    return a.player.nickname.localeCompare(b.player.nickname, "pt-BR");
  });
}
