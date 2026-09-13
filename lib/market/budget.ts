import { MAX_PRICE_CENTS } from "@/lib/scoring/pricing";
import { ROSTER_SIZE } from "@/lib/team/types";

/**
 * Orçamento do usuário — a metade "dinheiro" do plano 26
 * (`.claude/plans/26-regras-de-preco-e-saldo.md`). Diferente do plano 20, não
 * há mais teto de patrimônio: o usuário **pode** escalar os 5 jogadores mais
 * caros, desde que junte dinheiro para isso — o próprio preço máximo dos
 * jogadores já limita quanto um time vale, então um teto separado só
 * atrasaria sem necessidade.
 */

/** Orçamento inicial de cada time: 300,0 créditos (Suposição S4, plano 26). */
export const STARTING_BUDGET_CENTS = 30_000;

/**
 * O time dos sonhos: 5 jogadores no preço máximo (450,0 cr) — a meta que a
 * barra de "Meu Time" mostra. `STARTING_BUDGET_CENTS` fica de propósito
 * abaixo disto (o teste de guarda garante), mas nunca tão abaixo que vire
 * frustração — ver o teste de guarda abaixo.
 */
export const DREAM_TEAM_CENTS = ROSTER_SIZE * MAX_PRICE_CENTS;

/** Patrimônio de um time: saldo + valor do elenco. */
export function patrimonyCents(args: {
  balanceCents: number;
  squadValueCents: number;
}): number {
  return args.balanceCents + args.squadValueCents;
}

/**
 * Quanto falta de patrimônio para poder escalar os 5 jogadores mais caros —
 * nunca negativo (patrimônio acima do time dos sonhos não "sobra falta").
 */
export function dreamTeamGapCents(args: {
  balanceCents: number;
  squadValueCents: number;
}): number {
  return Math.max(0, DREAM_TEAM_CENTS - patrimonyCents(args));
}

/**
 * Quanto a escalação ganhou (positivo) ou perdeu (negativo) num fechamento
 * de rodada: soma de `priceAfterCents − priceBeforeCents` das vagas
 * ocupadas. É a mesma conta que `db/close-round.ts` grava em
 * `round_team_result.squad_valuation_cents` — o "você perdeu/ganhou X cr"
 * que `BudgetBar` mostra (Suposição S8, plano 26).
 */
export function squadValuationCents(
  slots: readonly { priceBeforeCents: number; priceAfterCents: number }[],
): number {
  return slots.reduce(
    (total, slot) => total + (slot.priceAfterCents - slot.priceBeforeCents),
    0,
  );
}
