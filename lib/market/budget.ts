/**
 * Orçamento e teto de patrimônio do usuário — a metade "dinheiro" do plano
 * 20: nenhum jogador pode consumir tudo, e o elenco all-star nunca cabe. As
 * quatro invariantes que sustentam estes números vivem no teste de guarda
 * de `budget.test.ts` — mexer numa constante sem mexer na outra quebra o
 * build.
 */

/** Orçamento inicial de cada time: 300,0 créditos (Decisão 1). */
export const STARTING_BUDGET_CENTS = 30_000;

/** Teto de patrimônio: 360,0 créditos, 1,2× o orçamento inicial (Decisão 3). */
export const MAX_PATRIMONY_CENTS = 36_000;

/** Patrimônio de um time: saldo + valor do elenco. */
export function patrimonyCents(args: {
  balanceCents: number;
  squadValueCents: number;
}): number {
  return args.balanceCents + args.squadValueCents;
}

/**
 * Quanto o teto cortou nesta rodada — `0` quando o patrimônio não passou
 * dele. Nunca maior que `balanceCents`: o corte mexe **só no caixa**, nunca
 * vende jogador (Decisão 4) — se o elenco sozinho já vale mais que o teto, o
 * corte é o caixa inteiro, e não um número teórico maior que ele.
 */
export function budgetTrimCents(args: {
  balanceCents: number;
  squadValueCents: number;
}): number {
  const overCents = Math.max(0, patrimonyCents(args) - MAX_PATRIMONY_CENTS);
  return Math.min(overCents, args.balanceCents);
}

/** O saldo depois do teto: corta só o caixa, nunca abaixo de zero (Decisão 4). */
export function trimmedBalanceCents(args: {
  balanceCents: number;
  squadValueCents: number;
}): number {
  return args.balanceCents - budgetTrimCents(args);
}
