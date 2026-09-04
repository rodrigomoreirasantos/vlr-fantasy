import dayjs from "dayjs";
import "dayjs/locale/pt-br";

import type { RoundMatch } from "@/lib/round/types";

// Nenhum componente formata data na mão — sempre via dayjs, aqui ou em
// `lib/championship/format.ts`, conforme a regra de datas do CLAUDE.md.
dayjs.locale("pt-br");

export type MarketWindow = { opensAt: Date; closesAt: Date };

/**
 * Quanto o mercado fecha **antes** do primeiro jogo — a regra inviolável nº 8.
 *
 * Não é no kickoff: escalar com o jogo prestes a começar já é escalar sabendo
 * de escalação divulgada, mapa escolhido e time em quadra. Uma hora de
 * antecedência é o que transforma a escalação numa aposta, e não numa
 * conferência.
 */
export const MARKET_CLOSE_LEAD_MS = 60 * 60_000;

/** O fechamento do mercado, dado o kickoff do primeiro jogo que ele tranca. */
export function marketClosesAtFor(firstKickoff: Date): Date {
  return new Date(firstKickoff.getTime() - MARKET_CLOSE_LEAD_MS);
}

/**
 * O grupo de fechamento de uma partida: **campeonato + dia**.
 *
 * É o recorte da regra. Um dia de VCT Americas costuma ter três ou quatro
 * jogos seguidos, e travar o mercado a cada um deles não seria uma regra, seria
 * um carrossel — o mercado de um campeonato fecha uma vez por dia, no primeiro
 * jogo daquele dia. E fecha por campeonato porque as ligas jogam em fusos
 * diferentes: Pacific abrir de madrugada não pode trancar quem só tem jogador
 * de Americas.
 */
function marketGroupKey(match: RoundMatch): string {
  const day = dayjs(match.scheduledAt).format("YYYY-MM-DD");
  return `${match.event}@${day}`;
}

/**
 * O fechamento do mercado de cada partida, por id: uma hora antes do primeiro
 * jogo do dia daquele campeonato. Jogos do mesmo campeonato no mesmo dia
 * compartilham o horário — é a regra, não um arredondamento.
 */
export function marketClosesByMatch(
  matches: readonly RoundMatch[],
): Map<string, Date> {
  const firstOfGroup = new Map<string, Date>();
  for (const match of matches) {
    const key = marketGroupKey(match);
    const current = firstOfGroup.get(key);
    if (!current || match.scheduledAt < current) {
      firstOfGroup.set(key, match.scheduledAt);
    }
  }

  return new Map(
    matches.map((match) => [
      match.id,
      marketClosesAtFor(firstOfGroup.get(marketGroupKey(match))!),
    ]),
  );
}

/**
 * O próximo fechamento entre as partidas dadas — o primeiro que ainda não
 * passou. `null` quando todos já passaram (ou não há partida).
 */
export function nextMarketClose(
  matches: readonly RoundMatch[],
  now: Date = new Date(),
): Date | null {
  const upcoming = [...marketClosesByMatch(matches).values()]
    .filter((closesAt) => closesAt.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  return upcoming[0] ?? null;
}

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
