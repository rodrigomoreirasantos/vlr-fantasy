import { dayKey } from "@/lib/round/day";
import { formatMatchDay } from "@/lib/round/format";
import type { RoundMatch } from "@/lib/round/types";

/** Um dia do calendário, com as partidas já em ordem de horário. */
export type MatchDay = {
  /** `YYYY-MM-DD` — chave estável de renderização, não texto de tela. */
  key: string;
  /** "Hoje", "Amanhã" ou "sáb, 06/09". */
  label: string;
  matches: RoundMatch[];
};

/**
 * Agrupa partidas por dia, preservando a ordem cronológica dentro de cada dia
 * e entre os dias.
 *
 * O agrupamento é a estrutura honesta deste conteúdo: um calendário se lê por
 * dia e por horário, não como uma lista corrida. Puro e sem React — testável
 * em milissegundos, como `lib/championship/standings.ts`.
 */
export function groupMatchesByDay(
  matches: readonly RoundMatch[],
  now: Date = new Date(),
): MatchDay[] {
  const byDay = new Map<string, RoundMatch[]>();

  // Ordena antes de agrupar: assim tanto os dias quanto as partidas dentro de
  // cada dia saem em ordem, sem depender da ordem em que vieram do banco.
  const ordered = [...matches].sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
  );

  for (const match of ordered) {
    const key = dayKey(match.scheduledAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(match);
    else byDay.set(key, [match]);
  }

  return [...byDay.entries()].map(([key, dayMatches]) => ({
    key,
    label: formatMatchDay(dayMatches[0].scheduledAt, now),
    matches: dayMatches,
  }));
}

/**
 * A próxima partida a começar — a que fecha o mercado (regra inviolável nº 8)
 * e a única que merece destaque na lista. `null` se todas já começaram.
 */
export function nextMatchId(
  matches: readonly RoundMatch[],
  now: Date = new Date(),
): string | null {
  const upcoming = matches
    .filter((match) => match.scheduledAt.getTime() > now.getTime())
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  return upcoming[0]?.id ?? null;
}
