import dayjs from "dayjs";
import "dayjs/locale/pt-br";

import { APP_TZ } from "@/lib/round/day";
import type { PlayerAvailability } from "@/lib/team/types";

// Nenhum componente formata data na mão — sempre via dayjs, no mesmo padrão
// de `lib/market/window.ts` e `lib/championship/format.ts`.
dayjs.locale("pt-br");

/**
 * Sempre no fuso do jogo (`APP_TZ`), nunca no do runtime. Servidor e cliente
 * têm de chegar ao mesmo texto — o mesmo motivo de `lib/round/day.ts` — ou o
 * primeiro paint (servidor, quase sempre UTC) diverge da hidratação (o fuso
 * de quem está lendo).
 */

/** Horário de uma partida, ex. "qua, 12/03 às 21:00". */
export function formatMatchKickoff(scheduledAt: Date): string {
  return dayjs(scheduledAt).tz(APP_TZ).format("ddd, DD/MM [às] HH:mm");
}

/** Só a hora, ex. "21:00" — a coluna pela qual se lê um calendário. */
export function formatKickoffTime(scheduledAt: Date): string {
  return dayjs(scheduledAt).tz(APP_TZ).format("HH:mm");
}

/**
 * Cabeçalho do dia num calendário: "Hoje", "Amanhã", "sáb, 06/09" ou, quando o
 * jogo é de outro ano, "sáb, 10/01/2027".
 *
 * "Hoje"/"Amanhã" não são enfeite — são a informação que o leitor de fato
 * procura ao decidir se dá tempo de mexer na escalação. `now` injetável
 * mantém o teste determinístico, como em `lib/market/window.ts`. O ano só
 * entra quando muda: escrevê-lo sempre polui os dias de hoje e da semana, que
 * são a maioria absoluta de um calendário que agora atravessa meses.
 */
export function formatMatchDay(
  scheduledAt: Date,
  now: Date = new Date(),
): string {
  const day = dayjs(scheduledAt).tz(APP_TZ);
  const today = dayjs(now).tz(APP_TZ);

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
