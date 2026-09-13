import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * O fuso da REGRA de negócio: em que fuso o jogo conta os dias.
 *
 * Duas regras do produto perguntam "isto é do mesmo dia?": o mercado fecha uma
 * vez por campeonato **por dia** (`marketClosesByMatch`) e os destaques de uma
 * região só saem quando ela termina de jogar **no dia** (`pendingRegions`). Sem
 * um fuso explícito, as duas respondiam com o relógio de quem estivesse
 * executando o código — UTC no servidor, o do visitante no navegador. Um jogo
 * de Americas às 22h de Brasília cai no dia seguinte em UTC, e isso bastava
 * para o portão liberar o placar de uma partida que ainda ia acontecer.
 *
 * É uma constante, não uma env, e é **igual para todo usuário** — diferente do
 * fuso de EXIBIÇÃO (`DISPLAY_FALLBACK_TZ`, `lib/round/timezone.ts`), que varia
 * por pessoa. Os dois hoje têm o mesmo valor porque o público é o mesmo, não
 * porque um derive do outro: mudar onde o "dia de jogo" começa é decisão de
 * produto, nunca efeito colateral de alguém viajar para outro fuso.
 */
export const GAME_DAY_TZ = "America/Sao_Paulo";

/** `"2026-09-04"` — a chave de agrupamento por dia, no fuso da regra. */
export function dayKey(date: Date, tz: string = GAME_DAY_TZ): string {
  return dayjs(date).tz(tz).format("YYYY-MM-DD");
}

/** As duas datas caem no mesmo dia civil do jogo? */
export function isSameDay(a: Date, b: Date, tz: string = GAME_DAY_TZ): boolean {
  return dayKey(a, tz) === dayKey(b, tz);
}
