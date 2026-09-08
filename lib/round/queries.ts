import { and, asc, desc, eq, gte, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  match,
  player,
  playerMatchStat,
  round,
  roundPlayerScore,
  roundRoster,
  roundTeamResult,
  vlrEvent,
} from "@/db/schema";
import {
  INTERNATIONAL_LOOKAHEAD_DAYS,
  INTERNATIONAL_LOOKBACK_DAYS,
} from "@/lib/round/international";
import {
  eventRegion,
  isLeagueRegion,
  type LeagueRegion,
} from "@/lib/round/regions";
import type {
  LiveRoundScore,
  PriceMover,
  RoundMatch,
  RoundRosterEntry,
  RoundScorer,
  RoundTeamResult,
} from "@/lib/round/types";
import type { Querier } from "@/lib/team/queries";

/**
 * Primitivas nomeadas de leitura de rodada — no mesmo espírito de
 * `lib/championship/queries.ts`: cada uma mockável individualmente, nunca
 * uma cadeia `select().from().where()` montada dentro da página ou da action.
 */

/** A "rodada fechada" da Home — a `finished` de maior número. */
export async function getLatestFinishedRound(q: Querier = db) {
  return q.query.round.findFirst({
    where: eq(round.status, "finished"),
    orderBy: (row, { desc }) => [desc(row.number)],
  });
}

/**
 * A rodada "que vem" da Home: a `active`. Fechar uma rodada promove a
 * `upcoming` de menor número a `active` na mesma transação
 * (`db/close-round.ts`) — então é ela, não uma `upcoming` parada, quem tem o
 * mercado aberto e o calendário que o usuário precisa acompanhar agora.
 *
 * O fallback cobre o estado degenerado em que não há rodada `active` (só um
 * ajuste manual no banco produz isso): a `upcoming` de menor número ainda é a
 * próxima rodada do usuário, e é melhor mostrá-la do que dizer que não há
 * rodada agendada tendo rodadas na tabela.
 */
export async function getNextRound(q: Querier = db) {
  const active = await q.query.round.findFirst({
    where: eq(round.status, "active"),
  });
  if (active) return active;

  return q.query.round.findFirst({
    where: eq(round.status, "upcoming"),
    orderBy: (row, { asc }) => [asc(row.number)],
  });
}

/** A rodada de um número específico — usada para achar "a rodada anterior" de uma rodada fechada. */
export async function getRoundByNumber(number: number, q: Querier = db) {
  return q.query.round.findFirst({ where: eq(round.number, number) });
}

/**
 * Uma partida já em andamento continua sendo "próximo jogo" até ser marcada
 * como encerrada. Sem esta folga ela sumiria da tela no instante do kickoff,
 * que é justamente quando o usuário mais olha — e uma Bo3 leva uma tarde.
 */
const LIVE_GRACE_MS = 6 * 60 * 60 * 1000;

/**
 * Os próximos jogos **reais** do circuito, vindos do pipeline do vlr.gg.
 *
 * O `innerJoin` com `vlr_event` + `tracked` é o filtro que importa: só entra
 * partida de campeonato que o fantasy segue, e as partidas de demonstração do
 * seed (sem `eventId`) ficam de fora por construção. É a lista que a Home
 * mostra independentemente de qual rodada está ativa — o calendário do
 * circuito não é o mesmo recorte que o calendário da sua rodada.
 */
export async function listUpcomingMatches(
  limit: number,
  now: Date = new Date(),
  q: Querier = db,
): Promise<RoundMatch[]> {
  const rows = await q
    .select({
      id: match.id,
      teamA: match.teamA,
      teamB: match.teamB,
      event: match.event,
      scheduledAt: match.scheduledAt,
      status: match.status,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      regionCode: vlrEvent.region,
    })
    .from(match)
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId))
    .where(
      and(
        eq(vlrEvent.tracked, true),
        ne(match.status, "finished"),
        gte(match.scheduledAt, new Date(now.getTime() - LIVE_GRACE_MS)),
      ),
    )
    .orderBy(asc(match.scheduledAt))
    .limit(limit);

  return rows;
}

export async function getTeamRoundResult(
  fantasyTeamId: string,
  roundId: string,
  q: Querier = db,
): Promise<RoundTeamResult | null> {
  const row = await q.query.roundTeamResult.findFirst({
    where: and(
      eq(roundTeamResult.fantasyTeamId, fantasyTeamId),
      eq(roundTeamResult.roundId, roundId),
    ),
  });
  if (!row) return null;

  return {
    points: row.points,
    balanceCents: row.balanceCents,
    squadValueCents: row.squadValueCents,
  };
}

/** As cinco vagas congeladas de um time numa rodada — `[]` sem snapshot ainda. */
export async function listRoundRoster(
  fantasyTeamId: string,
  roundId: string,
  q: Querier = db,
): Promise<RoundRosterEntry[]> {
  const rows = await q.query.roundRoster.findMany({
    where: and(
      eq(roundRoster.fantasyTeamId, fantasyTeamId),
      eq(roundRoster.roundId, roundId),
    ),
    orderBy: (row, { asc }) => [asc(row.position)],
    with: { player: true },
  });

  return rows.map((row) => ({
    position: row.position,
    player: row.player
      ? {
          id: row.player.id,
          nickname: row.player.nickname,
          team: row.player.team,
        }
      : null,
    captain: row.captain,
    points: row.points,
    priceCents: row.priceCents,
  }));
}

/**
 * O campeonato de cada jogador numa rodada: `player_match_stat ⋈ match`,
 * agrupado por jogador.
 *
 * `round_player_score` congela pontos e preços, mas não guarda **onde** o
 * jogador pontuou — e a Home passou a filtrar os destaques por região. Um
 * jogador disputa um campeonato por rodada, então o `min` é exato na prática e
 * determinístico no caso patológico.
 */
export async function getRoundPlayerEvents(
  roundId: string,
  q: Querier = db,
): Promise<Map<string, string>> {
  const rows = await q
    .select({
      playerId: playerMatchStat.playerId,
      event: sql<string>`min(${match.event})`,
    })
    .from(playerMatchStat)
    .innerJoin(match, eq(match.id, playerMatchStat.matchId))
    .where(eq(match.roundId, roundId))
    .groupBy(playerMatchStat.playerId);

  return new Map(rows.map((row) => [row.playerId, row.event]));
}

/**
 * Os pontuadores do jogo inteiro na rodada, do maior para o menor — usa
 * `round_player_score_points_idx`.
 *
 * **Sem `limit`:** o corte é por região (`trimHighlights`), e cortar aqui
 * deixaria uma liga inteira de fora só por não ter ninguém entre os maiores do
 * circuito. Uma rodada tem dezenas de linhas, não milhares — e o que chega ao
 * cliente já vem cortado.
 */
export async function getTopRoundScorers(
  roundId: string,
  q: Querier = db,
): Promise<RoundScorer[]> {
  return q
    .select({
      playerId: player.id,
      nickname: player.nickname,
      team: player.team,
      role: player.role,
      points: roundPlayerScore.points,
    })
    .from(roundPlayerScore)
    .innerJoin(player, eq(player.id, roundPlayerScore.playerId))
    .where(eq(roundPlayerScore.roundId, roundId))
    .orderBy(desc(roundPlayerScore.points));
}

/**
 * As variações de preço da rodada — usa `round_player_score_delta_idx`.
 *
 * Uma consulta só, com as duas pontas: quem separa altas de quedas é
 * `highlightsFor`, depois de escolhida a região. O filtro de sinal continua no
 * SQL — delta zero não é valorização nem queda, e trazê-lo faria o mesmo
 * jogador aparecer nas duas listas.
 */
export async function getRoundPriceMovers(
  roundId: string,
  q: Querier = db,
): Promise<PriceMover[]> {
  return q
    .select({
      playerId: player.id,
      nickname: player.nickname,
      team: player.team,
      role: player.role,
      priceDeltaCents: roundPlayerScore.priceDeltaCents,
    })
    .from(roundPlayerScore)
    .innerJoin(player, eq(player.id, roundPlayerScore.playerId))
    .where(
      and(
        eq(roundPlayerScore.roundId, roundId),
        ne(roundPlayerScore.priceDeltaCents, 0),
      ),
    )
    .orderBy(desc(roundPlayerScore.priceDeltaCents));
}

/**
 * A pontuação **parcial** da rodada em andamento, direto de
 * `player_match_stat`: só entra quem já jogou um mapa extraído.
 *
 * É o que sustenta os destaques ao vivo. `round_player_score` não serve aqui
 * — ela só existe depois de `closeActiveRound`, e a Home ficaria congelada na
 * rodada anterior enquanto os jogos da semana vão terminando.
 *
 * O `groupBy` pela PK de `player` basta: no Postgres as demais colunas da
 * mesma tabela são funcionalmente dependentes dela.
 */
export async function listLiveRoundScores(
  roundId: string,
  q: Querier = db,
): Promise<LiveRoundScore[]> {
  return q
    .select({
      playerId: player.id,
      nickname: player.nickname,
      team: player.team,
      role: player.role,
      points: sql<number>`sum(${playerMatchStat.fantasyPoints})::float8`,
      priceCents: player.priceCents,
      gamesPlayed: player.gamesPlayed,
      // De onde sai a região dos destaques. Um jogador disputa um campeonato
      // por rodada, então o `min` é exato na prática — e determinístico se um
      // dia deixar de ser.
      event: sql<string>`min(${match.event})`,
    })
    .from(playerMatchStat)
    .innerJoin(match, eq(match.id, playerMatchStat.matchId))
    .innerJoin(player, eq(player.id, playerMatchStat.playerId))
    .where(eq(match.roundId, roundId))
    .groupBy(player.id);
}

/**
 * As partidas que podem trancar o mercado agora: de campeonato seguido, de
 * ontem para frente.
 *
 * A cauda para trás não é folga — é o que sustenta a regra do dia. Um jogo das
 * 13h **já encerrado** ainda é quem define que o mercado daquele campeonato
 * fechou às 12h; ignorá-lo faria a trava reabrir no meio da tarde, entre uma
 * partida e a seguinte. E a janela para frente serve ao mapa
 * organização → campeonato, de que `lockedOrganizations` precisa para travar
 * também quem só joga depois.
 */
export async function listMarketLockMatches(
  now: Date = new Date(),
  q: Querier = db,
): Promise<RoundMatch[]> {
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return q
    .select({
      id: match.id,
      teamA: match.teamA,
      teamB: match.teamB,
      event: match.event,
      scheduledAt: match.scheduledAt,
      status: match.status,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      regionCode: vlrEvent.region,
    })
    .from(match)
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId))
    .where(
      and(
        eq(vlrEvent.tracked, true),
        gte(match.scheduledAt, from),
        lte(match.scheduledAt, to),
      ),
    )
    .orderBy(asc(match.scheduledAt));
}

// --- Leituras da região do jogador (`.claude/plans/10-time-por-regiao.md`) ---
// `eventRegion` é regex em TS, então o recorte de região nunca vai para o
// `WHERE` — as três funções abaixo trazem `event` + `vlrEvent.region` crus, e
// quem filtra por liga é `lib/player/region.ts`, no chamador.

/**
 * Uma linha por (jogador, partida de liga) — a matéria-prima da cascata de
 * região (`resolvePlayerRegion`). Só entram aparições cuja região é uma das
 * quatro ligas (`isLeagueRegion`) — um Masters ou um campeonato não
 * reconhecido nunca decide a região de ninguém aqui.
 */
export async function listPlayerLeagueAppearances(
  q: Querier = db,
): Promise<{ playerId: string; region: LeagueRegion; at: Date }[]> {
  const rows = await q
    .selectDistinct({
      playerId: playerMatchStat.playerId,
      event: match.event,
      regionCode: vlrEvent.region,
      scheduledAt: match.scheduledAt,
    })
    .from(playerMatchStat)
    .innerJoin(match, eq(match.id, playerMatchStat.matchId))
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId))
    .where(eq(vlrEvent.tracked, true));

  const appearances: { playerId: string; region: LeagueRegion; at: Date }[] =
    [];
  for (const row of rows) {
    const region = eventRegion(row.event, row.regionCode);
    if (isLeagueRegion(region)) {
      appearances.push({ playerId: row.playerId, region, at: row.scheduledAt });
    }
  }
  return appearances;
}

/**
 * Toda partida de evento seguido, com as duas organizações — o degrau 2 da
 * cascata (`organizationRegions`, lib/player/region.ts): a liga de uma
 * organização, para quem chega sem histórico próprio.
 */
export async function listOrganizationMatches(
  q: Querier = db,
): Promise<
  {
    teamA: string;
    teamB: string;
    event: string;
    regionCode: string | null;
    scheduledAt: Date;
  }[]
> {
  return q
    .select({
      teamA: match.teamA,
      teamB: match.teamB,
      event: match.event,
      regionCode: vlrEvent.region,
      scheduledAt: match.scheduledAt,
    })
    .from(match)
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId));
}

/**
 * A liga de uma única organização — a partida de liga mais recente dela, dos
 * dois lados. Versão pontual de `listOrganizationMatches`, usada no scrape de
 * uma partida internacional para resolver a região provisória de quem chega
 * sem histórico (`applyMatchPlayerRegions`, lib/vlr/persist/player-regions.ts).
 * `null` sem nenhuma partida de liga conhecida para essa organização.
 */
export async function organizationLeague(
  organization: string,
  q: Querier = db,
): Promise<LeagueRegion | null> {
  const rows = await q
    .select({
      event: match.event,
      regionCode: vlrEvent.region,
      scheduledAt: match.scheduledAt,
    })
    .from(match)
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId))
    .where(
      and(
        eq(vlrEvent.tracked, true),
        or(eq(match.teamA, organization), eq(match.teamB, organization)),
      ),
    )
    .orderBy(desc(match.scheduledAt));

  for (const row of rows) {
    const region = eventRegion(row.event, row.regionCode);
    if (isLeagueRegion(region)) return region;
  }
  return null;
}

/**
 * As partidas da janela do time Internacional (`hasInternationalEvent`,
 * `qualifiedOrganizations` — lib/round/international.ts): um pouco mais para
 * trás e mais para frente que a janela de trava do mercado
 * (`listMarketLockMatches`), porque aqui a pergunta não é "o que tranca hoje"
 * e sim "existe torneio internacional para esta aba existir".
 */
export async function listInternationalWindowMatches(
  now: Date = new Date(),
  q: Querier = db,
): Promise<RoundMatch[]> {
  const from = new Date(
    now.getTime() - INTERNATIONAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const to = new Date(
    now.getTime() + INTERNATIONAL_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
  );

  return q
    .select({
      id: match.id,
      teamA: match.teamA,
      teamB: match.teamB,
      event: match.event,
      scheduledAt: match.scheduledAt,
      status: match.status,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      regionCode: vlrEvent.region,
    })
    .from(match)
    .innerJoin(vlrEvent, eq(vlrEvent.id, match.eventId))
    .where(
      and(
        eq(vlrEvent.tracked, true),
        gte(match.scheduledAt, from),
        lte(match.scheduledAt, to),
      ),
    )
    .orderBy(asc(match.scheduledAt));
}
