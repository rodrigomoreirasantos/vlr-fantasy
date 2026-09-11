/**
 * A metade `séries → forma` da camada de pontuação — a base do "alvo pela
 * forma" que `lib/scoring/pricing.ts` usa
 * (Decisão 1, `.claude/plans/20-preco-dos-jogadores-e-orcamento.md`).
 */

/** Quantas séries entram na forma. 5 ≈ um mês e meio de liga (fato 9 do plano 20). */
export const FORM_WINDOW = 5;

/**
 * Média de pontos das últimas `window` séries, da mais recente para a mais
 * antiga (`seriesPointsDesc[0]` é a mais recente).
 *
 * `null` — **nunca `0`** — para quem não tem série nenhuma: zero é um
 * jogador ruim de verdade, ausência é um jogador desconhecido, e os dois
 * levam a preços diferentes (`targetPriceCents`, `lib/scoring/pricing.ts`).
 */
export function formPoints(
  seriesPointsDesc: readonly number[],
  window: number = FORM_WINDOW,
): number | null {
  if (seriesPointsDesc.length === 0) return null;

  const sample = seriesPointsDesc.slice(0, window);
  const total = sample.reduce((sum, points) => sum + points, 0);
  return Math.round((total / sample.length) * 10) / 10;
}
