import { dayKey } from "@/lib/round/day";
import { formatMatchDay } from "@/lib/round/format";
import { DISPLAY_FALLBACK_TZ } from "@/lib/round/timezone";
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
 *
 * O dia aqui é de EXIBIÇÃO (`tz`, o fuso de quem está lendo), não o `GAME_DAY_TZ`
 * da regra de negócio — são conceitos diferentes de propósito (ver o plano de
 * fuso do usuário): sob que cabeçalho a partida aparece pode variar por
 * pessoa, mesmo que o instante do jogo e o fechamento do mercado sejam os
 * mesmos para todo mundo.
 */
export function groupMatchesByDay(
  matches: readonly RoundMatch[],
  now: Date = new Date(),
  tz: string = DISPLAY_FALLBACK_TZ,
): MatchDay[] {
  const byDay = new Map<string, RoundMatch[]>();

  // Ordena antes de agrupar: assim tanto os dias quanto as partidas dentro de
  // cada dia saem em ordem, sem depender da ordem em que vieram do banco.
  const ordered = [...matches].sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
  );

  for (const match of ordered) {
    const key = dayKey(match.scheduledAt, tz);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(match);
    else byDay.set(key, [match]);
  }

  return [...byDay.entries()].map(([key, dayMatches]) => ({
    key,
    label: formatMatchDay(dayMatches[0].scheduledAt, now, tz),
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
