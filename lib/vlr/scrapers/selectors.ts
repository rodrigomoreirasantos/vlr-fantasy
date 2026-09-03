/**
 * **Todo seletor CSS do projeto mora aqui.** Nenhuma string de seletor em
 * qualquer outro arquivo — é o que transforma "o vlr.gg mudou o layout" num
 * diff de um arquivo só, e o que dá ao `pnpm vlr:doctor` uma lista fechada
 * para conferir contra a rede.
 *
 * Verificado contra as páginas reais em 03/09/2026 (ver `lib/vlr/fixtures/`).
 */

/** `/matches` e `/matches/results` — o mesmo card nas duas páginas. */
export const MATCH_LIST = {
  /** O cabeçalho de dia vive **fora** do card; o parser varre o documento em ordem. */
  dayLabel: ".wf-label.mod-large",
  card: "a.wf-module-item.match-item",
  time: ".match-item-time",
  teamName: ".match-item-vs-team-name .text-of",
  teamScore: ".match-item-vs-team-score",
  /** Presente no placar enquanto a partida não aconteceu (mostra "–"). */
  scoreUpcoming: ".match-item-vs-team-score.mod-upcoming",
  status: ".match-item-eta .ml-status",
  event: ".match-item-event",
  eventSeries: ".match-item-event-series",
} as const;

/** `/{vlrId}/?game=all&tab=overview` — a página que carrega todo o valor. */
export const MATCH_DETAIL = {
  header: ".match-header",
  headerEvent: "a.match-header-event",
  headerEventSeries: ".match-header-event-series",
  /** `data-utc-ts` **não é UTC** — ver `lib/vlr/normalize/kickoff.ts`. */
  headerTimestamp: ".match-header-date .moment-tz-convert[data-utc-ts]",
  headerTeamLink: "a.match-header-link",
  headerTeamName: ".wf-title-med",
  headerScoreWinner: ".match-header-vs-score-winner",
  headerScoreLoser: ".match-header-vs-score-loser",
  headerNote: ".match-header-vs-note",

  /** Um container por mapa, mais o agregado `data-game-id="all"`. */
  game: ".vm-stats-game[data-game-id]",
  gameHeader: ".vm-stats-game-header",
  gameMap: ".map",
  gameMapPick: ".picked",
  gameMapDuration: ".map-duration",
  gameTeam: ".team",
  gameTeamName: ".team-name",
  gameTeamScore: ".score",
  /** Marca o vencedor do mapa — alimenta o scout "vitória do mapa". */
  gameTeamWin: ".mod-win",

  table: ".ovw-table",
  row: ".ovw-row",
  rowHead: ".mod-head",
  playerCell: ".ovw-cell.mod-player",
  playerLink: ".ovw-player a[href]",
  playerName: ".ovw-player-name",
  playerTag: ".ovw-player-tag",
  playerFlag: ".ovw-player i.flag",
  agentImg: ".ovw-agents img",
} as const;

/**
 * Colunas de estatística, lidas por `data-col` — não por posição do elemento.
 * A ordem das colunas já mudou uma vez; o atributo, não.
 */
export const STAT_COLUMNS = [
  "rating2",
  "acs",
  "kast",
  "adr",
  "hsp",
  "fb",
  "fd",
] as const;
export type StatColumn = (typeof STAT_COLUMNS)[number];

export const KDA_COLUMNS = ["kills", "deaths", "assists"] as const;
export type KdaColumn = (typeof KDA_COLUMNS)[number];

/**
 * ⚠️ **Sempre `.mod-both` explícito.** A ordem dos três spans (`both`/`t`/`ct`)
 * muda de coluna para coluna — na fixture, `rating2` vem `t, ct, both` em
 * algumas linhas e `both, t, ct` em outras. Pegar "o primeiro span" produz o
 * número errado sem erro nenhum.
 */
export const SIDE_BOTH = "span.side.mod-both";

export function statCell(col: StatColumn): string {
  return `.ovw-cell[data-col="${col}"]`;
}

export function kdaStat(col: KdaColumn): string {
  return `.ovw-cell.mod-kda .ovw-kda-stat[data-col="${col}"]`;
}

/** `/events` */
export const EVENT_LIST = {
  card: "a.wf-card.mod-flex.event-item",
  title: ".event-item-title",
  status: ".event-item-desc-item-status",
  dates: ".event-item-desc-item.mod-dates",
  /** O rótulo "Dates" é filho do bloco de datas — sai antes de ler o texto. */
  descLabel: ".event-item-desc-item-label",
  /** A região vem na **classe** da bandeira (`mod-kr`), nunca em texto. */
  regionFlag: ".event-item-desc-item.mod-location i.flag",
} as const;

/** `/team/{id}/{slug}` */
export const TEAM_ROSTER = {
  headerName: ".team-header-name .wf-title",
  headerTag: ".team-header-tag",
  headerCountry: ".team-header-country",
  headerCountryFlag: ".team-header-country i.flag",
  item: ".team-roster-item",
  link: "a[href]",
  alias: ".team-roster-item-name-alias",
  realName: ".team-roster-item-name-real",
  /** **Presente = staff** (coach, manager). É o filtro que impede treinador virar jogador. */
  staffRole: ".team-roster-item-name-role",
  flag: ".team-roster-item-name-alias i.flag",
} as const;
