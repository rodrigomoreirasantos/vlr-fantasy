import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(isoWeek);

/**
 * Chave da semana ISO em UTC, ex. `"2026-W37"`. É a chave natural da rodada
 * semanal: `syncRoundsFromMatches` faz upsert de `round` por ela, o que torna
 * o job idempotente sem precisar inventar um `number` sequencial a cada
 * execução.
 *
 * Semana ISO (segunda a domingo) e ano ISO — não o ano do calendário. É o que
 * faz 31/12/2026 (quinta) e 01/01/2027 (sexta) caírem na **mesma** chave,
 * como devem: são a mesma rodada.
 */
export function weekKeyOf(date: Date): string {
  const moment = dayjs(date).utc();
  const week = String(moment.isoWeek()).padStart(2, "0");
  return `${moment.isoWeekYear()}-W${week}`;
}

/** Início (segunda, 00:00 UTC) da semana ISO de uma data. */
export function weekStartOf(date: Date): Date {
  return dayjs(date).utc().startOf("isoWeek").toDate();
}
