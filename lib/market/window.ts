import dayjs from "dayjs";
import "dayjs/locale/pt-br";

// Nenhum componente formata data na mão — sempre via dayjs, aqui ou em
// `lib/championship/format.ts`, conforme a regra de datas do CLAUDE.md.
dayjs.locale("pt-br");

export type MarketWindow = { opensAt: Date; closesAt: Date };

/** `now` injetável → testes determinísticos sem fake timers. */
export function isMarketOpen(w: MarketWindow, now: Date = new Date()): boolean {
  const current = dayjs(now);
  return !current.isBefore(w.opensAt) && current.isBefore(w.closesAt);
}

/** Tempo restante até o fechamento, ex. "36h 12m" | "12m" | "Encerrado". */
export function formatTimeLeft(closesAt: Date, now: Date = new Date()): string {
  const minutesLeft = dayjs(closesAt).diff(now, "minute");
  if (minutesLeft <= 0) return "Encerrado";

  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Data de fechamento por extenso, ex. "Fecha sáb, 14/03 às 18:00". */
export function formatClosesAt(closesAt: Date): string {
  return `Fecha ${dayjs(closesAt).format("ddd, DD/MM [às] HH:mm")}`;
}
