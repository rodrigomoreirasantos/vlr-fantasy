import dayjs from "dayjs";
import "dayjs/locale/pt-br";

import { DISPLAY_FALLBACK_TZ } from "@/lib/round/timezone";
import type { PlayerAvailability } from "@/lib/team/types";

// Nenhum componente formata data na mão — sempre via dayjs, no mesmo padrão
// de `lib/market/window.ts` e `lib/championship/format.ts`.
dayjs.locale("pt-br");

/**
 * Sempre no fuso de EXIBIÇÃO, nunca no do runtime. O fuso é **resolvido no
 * servidor** (`lib/round/timezone-selection.ts`) e desce como argumento —
 * nunca lido aqui dentro via `dayjs.tz.guess()` ou coisa parecida. É essa
 * garantia, e não o valor em si, que impede o mismatch de hidratação: se cada
 * chamador já recebe a mesma string (via `useTimezone()` no cliente, que veio
 * do mesmo servidor), servidor e cliente sempre chegam ao mesmo texto. Trocar
 * o parâmetro por uma leitura local do fuso do processo é como esse bug volta.
 */

/** Horário de uma partida, ex. "qua, 12/03 às 21:00", no fuso de quem lê. */
export function formatMatchKickoff(
  scheduledAt: Date,
  tz: string = DISPLAY_FALLBACK_TZ,
): string {
  return dayjs(scheduledAt).tz(tz).format("ddd, DD/MM [às] HH:mm");
}

/** Só a hora, ex. "21:00" — a coluna pela qual se lê um calendário. */
export function formatKickoffTime(
  scheduledAt: Date,
  tz: string = DISPLAY_FALLBACK_TZ,
): string {
  return dayjs(scheduledAt).tz(tz).format("HH:mm");
}

/**
 * Cabeçalho do dia num calendário: "Hoje", "Amanhã", "sáb, 06/09" ou, quando o
 * jogo é de outro ano, "sáb, 10/01/2027".
 *
 * "Hoje"/"Amanhã" não são enfeite — são a informação que o leitor de fato
 * procura ao decidir se dá tempo de mexer na escalação, e "hoje" depende de
 * onde ele está: um jogo às 23h de Brasília já é "amanhã" em Tóquio. `now`
 * injetável mantém o teste determinístico, como em `lib/market/window.ts`. O
 * ano só entra quando muda: escrevê-lo sempre polui os dias de hoje e da
 * semana, que são a maioria absoluta de um calendário que agora atravessa
 * meses.
 */
export function formatMatchDay(
  scheduledAt: Date,
  now: Date = new Date(),
  tz: string = DISPLAY_FALLBACK_TZ,
): string {
  const day = dayjs(scheduledAt).tz(tz);
  const today = dayjs(now).tz(tz);

  if (day.isSame(today, "day")) return "Hoje";
  if (day.isSame(today.add(1, "day"), "day")) return "Amanhã";
  return day.isSame(today, "year")
    ? day.format("ddd, DD/MM")
    : day.format("ddd, DD/MM/YYYY");
}

/**
 * A data legível por máquina do atributo `dateTime` de `<time>`. Existe para
 * que nenhum componente precise importar o dayjs só por causa disso — a regra
 * de datas do CLAUDE.md vale também para o atributo, não só para o texto.
 */
export function toIsoDate(date: Date): string {
  return dayjs(date).toISOString();
}

/**
 * O deslocamento de um fuso em relação ao UTC, do jeito que se fala em
 * português — "−3", "+9", "+5:30" — nunca o cru do `dayjs`/`Intl`
 * ("−03:00", "+09:00"). Existe para o rótulo "Horários em GMT{offset} (seu
 * fuso)" em `components/home/upcoming-matches.tsx`; a regra do CLAUDE.md é
 * que componente não formata data (nem deslocamento) na mão.
 */
export function formatTimezoneOffset(
  tz: string,
  now: Date = new Date(),
): string {
  const raw = dayjs(now).tz(tz).format("Z"); // ex.: "-03:00", "+09:00", "+05:30"
  const sign = raw.startsWith("-") ? "−" : "+";
  const hours = String(Number(raw.slice(1, 3)));
  const minutes = raw.slice(4, 6);
  return minutes === "00" ? `${sign}${hours}` : `${sign}${hours}:${minutes}`;
}

const AVAILABILITY_LABELS: Record<PlayerAvailability, string> = {
  available: "Disponível",
  bench: "Reserva",
  injured: "Lesionado",
  eliminated: "Time eliminado",
  doubtful: "Dúvida",
};

/** Rótulo curto pt-BR de cada estado de disponibilidade. */
export function availabilityLabel(availability: PlayerAvailability): string {
  return AVAILABILITY_LABELS[availability];
}

/**
 * Frase completa do alerta de indisponibilidade, ex. "TenZ não deve jogar
 * (Lesionado): fora por lesão no pulso.". Sem nota, cai só no rótulo.
 */
export function availabilityMessage(
  nickname: string,
  availability: PlayerAvailability,
  note: string | null,
): string {
  const base = `${nickname} não deve jogar (${availabilityLabel(availability)})`;
  return note ? `${base}: ${note}.` : `${base}.`;
}
