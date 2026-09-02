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

/**
 * A frase completa do estado do mercado de uma rodada — os **três** estados,
 * não só o de fechamento: antes de abrir, aberto, e já encerrado. Existe
 * porque `formatTimeLeft` sozinho devolve "Encerrado", e concatenar isso a um
 * prefixo fixo produzia "Mercado fecha em Encerrado"; pior, com a janela
 * ainda no futuro a Home anunciava um fechamento enquanto `/my-team` mostrava
 * o mercado fechado.
 *
 * `now` injetável: o servidor renderiza a frase no primeiro paint e o cliente
 * recalcula a mesma função a cada tick (`components/home/market-countdown.tsx`).
 */
export function formatMarketCountdown(
  w: MarketWindow,
  now: Date = new Date(),
): string {
  if (dayjs(now).isBefore(w.opensAt)) {
    return `Mercado abre em ${formatTimeLeft(w.opensAt, now)}`;
  }
  if (isMarketOpen(w, now)) {
    return `Mercado fecha em ${formatTimeLeft(w.closesAt, now)}`;
  }
  return "Mercado fechado";
}
