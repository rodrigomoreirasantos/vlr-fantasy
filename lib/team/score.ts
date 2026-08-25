import type { Player, RosterSlot } from "./types";

/** Como uma pontuação se lê num relance: boa, morna ou ruim. */
export type ScoreTone = "positive" | "neutral" | "negative";

/**
 * Faixas provisórias, calibradas pelo design de referência (24.6 e 18.2 como
 * boas, 9.4 morna, 6.1 ruim).
 *
 * TODO: substituir por limiares derivados da média da rodada quando a camada
 * de pontuação real existir em `lib/scoring/`.
 */
export const SCORE_THRESHOLDS = { positive: 12, neutral: 8 } as const;

export function scoreTone(score: number): ScoreTone {
  if (score >= SCORE_THRESHOLDS.positive) return "positive";
  if (score >= SCORE_THRESHOLDS.neutral) return "neutral";
  return "negative";
}

/** Pontuação exibida sempre com uma casa decimal, ex. `24.6`. */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

function filledSlots(roster: RosterSlot[]): Player[] {
  return roster.flatMap((slot) => (slot.player ? [slot.player] : []));
}

export function highestScorer(roster: RosterSlot[]): Player | null {
  return filledSlots(roster).reduce<Player | null>(
    (best, player) => (!best || player.score > best.score ? player : best),
    null,
  );
}

export function lowestScorer(roster: RosterSlot[]): Player | null {
  return filledSlots(roster).reduce<Player | null>(
    (worst, player) => (!worst || player.score < worst.score ? player : worst),
    null,
  );
}
