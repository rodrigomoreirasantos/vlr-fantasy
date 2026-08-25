/**
 * Toda moeda do jogo é armazenada e transportada em centavos de crédito
 * (inteiro), nunca em ponto flutuante. Este módulo é a única fronteira onde
 * centavos viram texto para o usuário — nenhum componente formata dinheiro
 * na mão.
 */
export const CENTS_PER_CREDIT = 100;

export function creditsToCents(credits: number): number {
  return Math.round(credits * CENTS_PER_CREDIT);
}

export function centsToCredits(cents: number): number {
  return cents / CENTS_PER_CREDIT;
}

/** Moeda sempre com uma casa: 14820 → "148.2". */
export function formatCredits(cents: number): string {
  return centsToCredits(cents).toFixed(1);
}

/** Variação com sinal: "+12.5" / "−12.5". */
export function formatCreditsDelta(cents: number): string {
  const credits = centsToCredits(cents);
  const sign = credits < 0 ? "−" : "+";
  return `${sign}${Math.abs(credits).toFixed(1)}`;
}
