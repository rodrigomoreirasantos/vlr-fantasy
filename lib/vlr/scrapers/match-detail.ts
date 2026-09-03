import { load, type Cheerio, type CheerioAPI } from "cheerio";

import { parseVlrTimestamp } from "@/lib/vlr/normalize/kickoff";
import {
  parseScraped,
  scrapedMatchDetailSchema,
  type ScrapedMap,
  type ScrapedMatchDetail,
  type ScrapedPlayerStat,
} from "@/lib/vlr/schemas";
import {
  KDA_COLUMNS,
  MATCH_DETAIL,
  SIDE_BOTH,
  STAT_COLUMNS,
  kdaStat,
  statCell,
} from "@/lib/vlr/scrapers/selectors";
import {
  SelectorMissError,
  decimal,
  int,
  regionFromFlagClass,
  requireAll,
  requireWithin,
  text,
  vlrIdFromHref,
  type VlrNode,
} from "@/lib/vlr/scrapers/parse";

/**
 * `/{vlrId}/?game=all&tab=overview` — **uma requisição traz a série inteira**:
 * o agregado e todos os mapas vêm no mesmo HTML, cada um num
 * `div.vm-stats-game[data-game-id]`.
 *
 * Guardamos só as linhas **por mapa**, nunca o agregado `all`: o prompt exige
 * pontuar por mapa e somar, e ter as duas coisas no banco convidaria a somar
 * duas vezes. A série é uma query (`SUM`), não uma linha.
 *
 * Função pura: recebe HTML, devolve dado validado. Não conhece rede nem banco.
 */
export function parseMatchDetail(
  html: string,
  vlrId: string,
): ScrapedMatchDetail {
  const $ = load(html);
  const ctx = `match ${vlrId}`;

  const header = requireAll($, MATCH_DETAIL.header, ctx).first();

  // Evento: o nome é o texto do link **menos** a série ("Playoffs: Upper
  // Semifinals"), que é um filho dele. Clonar e remover é mais robusto do que
  // depender de um `div` com style inline.
  const eventLink = requireWithin(
    header,
    MATCH_DETAIL.headerEvent,
    ctx,
  ).first();
  const eventClone = eventLink.clone();
  eventClone.find(MATCH_DETAIL.headerEventSeries).remove();
  const eventSeries = text(eventLink.find(MATCH_DETAIL.headerEventSeries));

  // ⚠️ `data-utc-ts` não é UTC — a conversão obrigatória mora em `kickoff.ts`.
  const rawTimestamp = requireWithin(header, MATCH_DETAIL.headerTimestamp, ctx)
    .first()
    .attr("data-utc-ts");
  if (!rawTimestamp) {
    throw new SelectorMissError(MATCH_DETAIL.headerTimestamp, ctx);
  }

  const teamLinks = requireWithin(header, MATCH_DETAIL.headerTeamLink, ctx);
  if (teamLinks.length < 2) {
    throw new SelectorMissError(MATCH_DETAIL.headerTeamLink, ctx);
  }
  const teams = [0, 1].map((index) => {
    const link = teamLinks.eq(index);
    return {
      vlrId: vlrIdFromHref(link.attr("href"), "team"),
      name: text(link.find(MATCH_DETAIL.headerTeamName).first()),
    };
  });

  // Os dois spans de placar saem em ordem de documento: o primeiro é o time da
  // esquerda, ganhando ou perdendo. Selecionar por `-winner`/`-loser`
  // separadamente inverteria o placar sempre que o time B vencesse.
  const scoreSpans = header.find(
    `${MATCH_DETAIL.headerScoreWinner}, ${MATCH_DETAIL.headerScoreLoser}`,
  );
  const scoreA = scoreSpans.length > 0 ? int(text(scoreSpans.eq(0))) : null;
  const scoreB = scoreSpans.length > 1 ? int(text(scoreSpans.eq(1))) : null;

  const notes = header
    .find(MATCH_DETAIL.headerNote)
    .toArray()
    .map((node) => text($(node)));
  const bestOf = int(
    notes.find((note) => /^bo\d+$/i.test(note))?.slice(2) ?? null,
  );

  const maps = parseMaps($, ctx);

  return parseScraped(
    scrapedMatchDetailSchema,
    {
      vlrId,
      event: {
        vlrId: vlrIdFromHref(eventLink.attr("href"), "event"),
        name: text(eventClone),
        series: eventSeries.length > 0 ? eventSeries : null,
      },
      scheduledAt: parseVlrTimestamp(rawTimestamp),
      teamA: teams[0],
      teamB: teams[1],
      scoreA,
      scoreB,
      bestOf,
      status: matchStatusFrom(notes, scoreA, scoreB),
      maps,
    },
    ctx,
  );
}

/** "final"/"live" no cabeçalho, e o placar como desempate. */
function matchStatusFrom(
  notes: readonly string[],
  scoreA: number | null,
  scoreB: number | null,
): "upcoming" | "live" | "finished" {
  const lowered = notes.map((note) => note.toLowerCase());
  if (lowered.some((note) => note.includes("live"))) return "live";
  if (lowered.some((note) => note.includes("final"))) return "finished";
  return scoreA !== null && scoreB !== null ? "finished" : "upcoming";
}

/** `"49:59"` → 2999 segundos. */
function durationSeconds(raw: string): number | null {
  const match = raw.match(/(\d+):(\d{2})/);
  if (!match) return null;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

/**
 * Um `ScrapedMap` por container com `data-game-id` **numérico**. O agregado
 * (`data-game-id="all"`) é descartado aqui — e é a única linha que impede o
 * banco de contar toda a série duas vezes.
 */
function parseMaps($: CheerioAPI, ctx: string): ScrapedMap[] {
  const games = requireAll($, MATCH_DETAIL.game, ctx);
  const maps: ScrapedMap[] = [];

  games.each((_, node) => {
    const game = $(node);
    const gameVlrId = game.attr("data-game-id");
    if (!gameVlrId || !/^\d+$/.test(gameVlrId)) return;

    const mapCtx = `${ctx} map ${gameVlrId}`;
    const gameHeader = requireWithin(
      game,
      MATCH_DETAIL.gameHeader,
      mapCtx,
    ).first();

    const mapNameEl = requireWithin(gameHeader, MATCH_DETAIL.gameMap, mapCtx)
      .first()
      .clone();
    // "PICK" e a duração são filhos de `.map`: sobra o nome do mapa.
    mapNameEl.find(MATCH_DETAIL.gameMapPick).remove();
    mapNameEl.find(MATCH_DETAIL.gameMapDuration).remove();

    const teamBlocks = gameHeader.find(MATCH_DETAIL.gameTeam);
    const teamResults = [0, 1].map((index) => {
      const scoreEl = teamBlocks
        .eq(index)
        .find(MATCH_DETAIL.gameTeamScore)
        .first();
      return {
        score: int(text(scoreEl)),
        won: scoreEl.is(MATCH_DETAIL.gameTeamWin),
      };
    });

    // Uma tabela por time, na mesma ordem do cabeçalho do mapa: é o que liga
    // cada jogador ao resultado do seu lado (`won`).
    const tables = requireWithin(game, MATCH_DETAIL.table, mapCtx);
    const players: ScrapedPlayerStat[] = [];

    tables.each((tableIndex, tableNode) => {
      const won = teamResults[tableIndex]?.won ?? false;
      const teamSide = tableIndex === 0 ? "a" : "b";
      $(tableNode)
        .find(MATCH_DETAIL.row)
        .not(MATCH_DETAIL.rowHead)
        .each((__, rowNode) => {
          players.push(
            parsePlayerRow($, $(rowNode), { won, teamSide }, mapCtx),
          );
        });
    });

    maps.push({
      gameVlrId,
      name: text(mapNameEl),
      durationSeconds: durationSeconds(
        text(gameHeader.find(MATCH_DETAIL.gameMapDuration).first()),
      ),
      scoreA: teamResults[0]?.score ?? null,
      scoreB: teamResults[1]?.score ?? null,
      players,
    });
  });

  return maps;
}

/** O valor `.mod-both` de uma célula. **Sempre explícito** — ver `SIDE_BOTH`. */
function bothSide<T extends VlrNode>(
  row: Cheerio<T>,
  cellSelector: string,
): string | null {
  const cell = row.find(cellSelector).first();
  if (cell.length === 0) return null;
  const span = cell.find(SIDE_BOTH).first();
  return span.length === 0 ? null : text(span);
}

function parsePlayerRow<T extends VlrNode>(
  $: CheerioAPI,
  row: Cheerio<T>,
  side: { won: boolean; teamSide: "a" | "b" },
  ctx: string,
): ScrapedPlayerStat {
  const link = requireWithin(row, MATCH_DETAIL.playerLink, ctx).first();
  const playerVlrId = vlrIdFromHref(link.attr("href"), "player");
  if (!playerVlrId) throw new SelectorMissError(MATCH_DETAIL.playerLink, ctx);

  const tag = text(row.find(MATCH_DETAIL.playerTag).first());
  // Código de duas letras (`flag mod-us` → "us"), o mesmo formato que
  // `team-roster.ts` produz e que `player.country` documenta. O `title` da
  // bandeira traz "United States": misturar os dois faria o valor da coluna
  // depender de qual scraper rodou por último.
  const country = regionFromFlagClass(
    row.find(MATCH_DETAIL.playerFlag).first().attr("class"),
  );

  const agents = row
    .find(MATCH_DETAIL.agentImg)
    .toArray()
    .map((node) => $(node).attr("title") ?? $(node).attr("alt") ?? "")
    .filter((agent) => agent.length > 0);

  const stat = (col: (typeof STAT_COLUMNS)[number]) =>
    bothSide(row, statCell(col));
  const kda = (col: (typeof KDA_COLUMNS)[number]) =>
    bothSide(row, kdaStat(col));

  return {
    vlrId: playerVlrId,
    nickname: text(requireWithin(row, MATCH_DETAIL.playerName, ctx).first()),
    teamTag: tag.length > 0 ? tag : null,
    country,
    agents,
    rating: decimal(stat("rating2")),
    acs: int(stat("acs")),
    kills: int(kda("kills")),
    deaths: int(kda("deaths")),
    assists: int(kda("assists")),
    kast: int(stat("kast")),
    adr: int(stat("adr")),
    headshotPct: int(stat("hsp")),
    firstKills: int(stat("fb")),
    firstDeaths: int(stat("fd")),
    won: side.won,
    teamSide: side.teamSide,
  };
}
