/**
 * Pontuação de time — a metade `pontos → preço/ranking` da camada de
 * pontuação que `lib/team/score.ts:11` já apontava como TODO. A metade
 * `stats → pontos` (kills, ACS, clutches…) fica para uma fatia futura;
 * `player.score` continua sendo o ponto de entrada.
 */

/** A braçadeira dobra a pontuação do jogador. Única fonte da constante — a
 * classificação (`lib/championship/queries.ts`) a interpola num `sql` template. */
export const CAPTAIN_MULTIPLIER = 2;

/** Pontuação de um jogador já com o multiplicador de capitão aplicado. */
export function playerContribution(score: number, captain: boolean): number {
  return captain ? score * CAPTAIN_MULTIPLIER : score;
}

/**
 * Soma a pontuação de uma escalação, dobrando a do capitão. Vagas vazias
 * (`player: null`) não contribuem — um time sem ninguém escalado soma 0.
 */
export function teamPoints(
  slots: readonly { player: { score: number } | null; captain: boolean }[],
): number {
  return slots.reduce(
    (total, slot) =>
      total +
      (slot.player ? playerContribution(slot.player.score, slot.captain) : 0),
    0,
  );
}
