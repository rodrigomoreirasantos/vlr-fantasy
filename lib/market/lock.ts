import { marketClosesByMatch } from "@/lib/market/window";
import { isSameDay } from "@/lib/round/day";
import type { RoundMatch } from "@/lib/round/types";

/**
 * A trava de escalação, do lado de quem compra e vende.
 *
 * A regra é a mesma que a Home mostra (`marketClosesByMatch`): o mercado de um
 * campeonato fecha uma hora antes do primeiro jogo dele naquele dia. Aqui ela
 * vira a pergunta que a substituição precisa responder — *este jogador ainda
 * pode ser negociado agora?* — e a resposta é por organização, não global:
 * um dia de Pacific não pode trancar quem só tem jogador de Americas.
 *
 * **Fecha por campeonato, não por confronto.** Se VCT Americas joga hoje, todo
 * jogador de Americas fica travado, tenha a organização dele jogo hoje ou não.
 * É o que impede a jogada óbvia: ver o primeiro mapa do dia, entender que o
 * meta mudou, e reescalar quem entra em quadra às 22h.
 *
 * **Reabre no dia seguinte.** A trava vale pelo dia inteiro do campeonato — o
 * fechamento é diário, e não a cada partida, senão o mercado viraria um
 * carrossel de abre-fecha entre um jogo e outro da mesma tarde.
 *
 * "Hoje" aqui é `GAME_DAY_TZ` (`lib/round/day.ts`), o mesmo fuso que
 * `marketGroupKey` usa para decidir qual instante é o fechamento — as duas
 * regras falam do "dia de jogo" e não podem discordar sobre onde ele começa.
 * Sem isso, a fronteira de dia seguia o relógio do processo (UTC na Vercel) e
 * a trava podia reabrir horas antes do dia de jogo terminar de verdade.
 */
export function lockedOrganizations(
  matches: readonly RoundMatch[],
  now: Date = new Date(),
): string[] {
  const closesBy = marketClosesByMatch(matches);

  // 1. Os campeonatos que já fecharam hoje.
  const closedEvents = new Set<string>();
  for (const match of matches) {
    if (!isSameDay(match.scheduledAt, now)) continue;

    const closesAt = closesBy.get(match.id);
    if (closesAt && closesAt.getTime() <= now.getTime()) {
      closedEvents.add(match.event);
    }
  }

  // 2. Toda organização que joga nesses campeonatos — inclusive as que só
  // entram em quadra outro dia. É o campeonato que fecha, não o confronto.
  const locked = new Set<string>();
  for (const match of matches) {
    if (!closedEvents.has(match.event)) continue;
    locked.add(match.teamA);
    locked.add(match.teamB);
  }

  return [...locked];
}

/** O mercado deste jogador está fechado? `team` é a organização dele. */
export function isTeamLocked(
  lockedTeams: readonly string[],
  team: string,
): boolean {
  return lockedTeams.includes(team);
}
