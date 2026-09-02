/**
 * Motor de preço — a metade `pontos → preço` da camada de pontuação que o
 * CLAUDE.md exige isolada do banco e dos componentes. Fechar uma rodada
 * (`db/close-round.ts`) chama `nextPriceCents` para cada jogador do catálogo;
 * `priceDeltaCents` isolado serve tanto para gravar `round_player_score`
 * quanto para os testes de invariante abaixo.
 */

/** Cada ponto acima (ou abaixo) da média da rodada move o preço em 2.0 créditos. */
export const PRICE_PER_POINT_CENTS = 200;

/** Teto de variação por rodada: 15% do preço — ninguém dobra nem some numa rodada só. */
export const MAX_SWING_RATIO = 0.15;

/** Piso de 10.0 créditos: `player_price_cents_positive` exige `> 0`. */
export const MIN_PRICE_CENTS = 1_000;

/** Média das pontuações da rodada. `0` para um catálogo vazio — nunca `NaN`. */
export function averagePoints(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

/**
 * Variação de preço já com o teto de 15% e o piso `MIN_PRICE_CENTS`
 * aplicados — nunca o delta "cru". É o que mantém a invariante
 * `nextPriceCents(x) - x === priceDeltaCents(x)` verdadeira por construção
 * (ambas as funções aplicam exatamente esta mesma regra), e por consequência
 * o `CHECK round_player_score_delta_consistent` do banco.
 */
export function priceDeltaCents(args: {
  priceCents: number;
  points: number;
  averagePoints: number;
}): number {
  const { priceCents, points, averagePoints } = args;

  const rawDeltaCents = Math.round(
    (points - averagePoints) * PRICE_PER_POINT_CENTS,
  );
  const maxSwingCents = Math.round(priceCents * MAX_SWING_RATIO);
  const cappedDeltaCents = Math.max(
    -maxSwingCents,
    Math.min(maxSwingCents, rawDeltaCents),
  );

  const flooredPriceCents = Math.max(
    MIN_PRICE_CENTS,
    priceCents + cappedDeltaCents,
  );
  return flooredPriceCents - priceCents;
}

/** Novo preço do jogador após a rodada — `priceCents + priceDeltaCents(args)`. */
export function nextPriceCents(args: {
  priceCents: number;
  points: number;
  averagePoints: number;
}): number {
  return args.priceCents + priceDeltaCents(args);
}
