import dayjs from "dayjs";
import "dayjs/locale/pt-br";

import { GAME_DAY_TZ, dayKey } from "@/lib/round/day";
import { matchRegion, type TeamRegion } from "@/lib/round/regions";
import { DISPLAY_FALLBACK_TZ } from "@/lib/round/timezone";
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
  // GAME_DAY_TZ, explícito e não o default de `dayKey`: este arquivo também
  // importa DISPLAY_FALLBACK_TZ (para `formatClosesAt`, abaixo), e os dois
  // fusos convivem aqui por razões diferentes — este é o "dia de jogo" que o
  // portão dos destaques usa, e as duas regras não podem discordar sobre onde
  // ele começa. Não é o fuso de quem está lendo a tela.
  return `${match.event}@${dayKey(match.scheduledAt, GAME_DAY_TZ)}`;
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
 * As partidas que decidem o fechamento do mercado de um **time** (região de
 * liga, ou o time Internacional): as dele mesmo, mais as internacionais —
 * porque um Masters/Champions que fecha hoje tranca `lockedOrganizations`
 * pela organização, região incluída, e o número exibido tem de ser o mesmo
 * que vai travar.
 *
 * `organizations` é o escopo do time Internacional (as classificadas,
 * `MarketScope`) e existe para fechar exatamente essa discordância. A trava
 * é **por organização** e olha o circuito inteiro; um recorte só por
 * `eventRegion` deixaria o time Internacional contando para o Masters das
 * 20h enquanto suas organizações já estão travadas desde as 12h por jogarem
 * a própria liga hoje — o relógio anunciando um mercado que, na prática, já
 * fechou. Vazio para os times de liga: lá `eventRegion` já cobre as
 * organizações da região.
 *
 * Diferente de `matchesInRegion` (`lib/round/regions.ts`), que devolve o
 * recorte exato de uma única `EventRegion` para a grade da Home.
 */
export function marketMatchesFor(
  matches: readonly RoundMatch[],
  region: TeamRegion,
  organizations: readonly string[] = [],
): RoundMatch[] {
  return matches.filter((match) => {
    const eventReg = matchRegion(match);
    if (region === "international") {
      return (
        eventReg === "international" ||
        organizations.includes(match.teamA) ||
        organizations.includes(match.teamB)
      );
    }
    return eventReg === region || eventReg === "international";
  });
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

/**
 * Data de fechamento por extenso, ex. "Fecha sáb, 14/03 às 18:00" — no fuso de
 * EXIBIÇÃO (quem está lendo), como todo formatador de data da tela
 * (`lib/round/format.ts`). Não confundir com `GAME_DAY_TZ`, usado acima em
 * `marketGroupKey`: aquele decide **qual** instante é o fechamento (igual
 * para todo mundo); este só decide **como escrever** esse instante.
 */
export function formatClosesAt(
  closesAt: Date,
  tz: string = DISPLAY_FALLBACK_TZ,
): string {
  return `Fecha ${dayjs(closesAt).tz(tz).format("ddd, DD/MM [às] HH:mm")}`;
}

/**
 * A frase do fechamento do mercado, ex. "Mercado fecha em 7h 0m".
 *
 * Substituiu a frase de três estados da janela de rodada: com o fechamento
 * derivado do primeiro jogo do dia (`marketClosesByMatch`), não existe mais um
 * "abre em" — o mercado está aberto até o próximo dia de jogo trancar.
 *
 * `now` injetável: o servidor formata a frase no primeiro paint e o cliente
 * recalcula a mesma função a cada tick (`components/market/market-countdown.tsx`).
 */
export function formatMarketClose(
  closesAt: Date,
  now: Date = new Date(),
): string {
  const left = formatTimeLeft(closesAt, now);
  return left === "Encerrado" ? "Mercado fechado" : `Mercado fecha em ${left}`;
}

/**
 * De quanto em quanto tempo uma tela com mercado se atualiza sozinha.
 *
 * `LIVE_REFRESH_MS` é de minuto em minuto — placar de partida ao vivo ou
 * rodada em curso pontuando, na Home (`refreshIntervalMs`,
 * `lib/home/summary.ts`). `IDLE_REFRESH_MS` é o ritmo parado: fora dessas
 * janelas, o que muda é o calendário (em horas) ou a trava do dia — e ela só
 * tem chance de mudar perto do próprio fechamento, daí `myTeamRefreshMs`
 * escalar para o ritmo rápido só na última hora antes de `closesAt`.
 */
export const LIVE_REFRESH_MS = 60_000;
export const IDLE_REFRESH_MS = 5 * 60_000;

/**
 * O ritmo de atualização automática da `/my-team` (`<LiveRefresh>`).
 *
 * Sem partida ao vivo para vigiar (isso é a Home) — aqui o que envelhece com
 * o relógio é a trava do dia (`lockedOrganizations`): perto do fechamento,
 * clicar numa vaga pode devolver um bloqueio que a tela ainda não mostrava.
 * `MARKET_CLOSE_LEAD_MS` (a mesma hora de antecedência da regra em si) é o
 * raio dentro do qual vale apertar o ritmo; fora dele o ritmo parado basta.
 */
export function myTeamRefreshMs(
  closesAt: Date | null,
  now: Date = new Date(),
): number {
  if (!closesAt) return IDLE_REFRESH_MS;
  const msUntilClose = closesAt.getTime() - now.getTime();
  return msUntilClose <= MARKET_CLOSE_LEAD_MS
    ? LIVE_REFRESH_MS
    : IDLE_REFRESH_MS;
}
