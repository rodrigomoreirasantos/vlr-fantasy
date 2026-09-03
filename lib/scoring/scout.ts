/**
 * Scout — a metade `stats → pontos` da camada de pontuação, que
 * `lib/scoring/team.ts` deixava explicitamente como TODO. Fecha o circuito:
 * as estatísticas reais de uma partida do vlr.gg viram os pontos que
 * `player.score` acumula, e daí `teamPoints` e `nextPriceCents` seguem o
 * fluxo que já existe.
 *
 * Puro por exigência do CLAUDE.md: sem banco, sem HTTP, sem React. Recebe
 * números, devolve números.
 */

/**
 * Versão da tabela de regras. Toda linha de `player_match_stat` guarda a
 * versão com que foi calculada — mudar `SCOUT_RULES` sem incrementar isto
 * deixaria pontuações de eras diferentes indistinguíveis no banco.
 */
export const SCOUT_VERSION = 1;

/** Uma faixa de bonificação: `stat >= min` vale `points`. */
type Tier = {
  readonly stat: ScoutStat;
  readonly min: number;
  readonly points: number;
};

/** Uma penalidade: `stat < below` vale `points` (negativo). */
type Penalty = {
  readonly stat: ScoutStat;
  readonly below: number;
  readonly points: number;
};

/** As estatísticas que entram em faixa ou penalidade (as de evento vêm à parte). */
export type ScoutStat = "acs" | "kast" | "adr" | "rating";

/**
 * As regras como **dado**, não como código: a tabela é lida por `mapPoints`
 * e por nada mais, então revisar o balanceamento é editar este objeto.
 *
 * As faixas são **exclusivas** e avaliadas de cima para baixo, por estatística:
 * um ACS de 260 vale +3, não +4.5. A tabela do prompt é ambígua nesse ponto e
 * empilhar premiaria duas vezes o mesmo número.
 */
export const SCOUT_RULES = {
  perEvent: {
    kill: 2,
    death: -1,
    assist: 0.5,
    firstKill: 1.5,
    firstDeath: -1,
  },
  tiers: [
    { stat: "acs", min: 250, points: 3 },
    { stat: "acs", min: 200, points: 1.5 },
    { stat: "kast", min: 75, points: 2 },
    { stat: "adr", min: 150, points: 2 },
    { stat: "rating", min: 1.2, points: 3 },
  ] as readonly Tier[],
  penalties: [{ stat: "rating", below: 0.8, points: -2 }] as readonly Penalty[],
  /** Vencer o mapa vale pontos: o fantasy premia quem ganha, não só quem fraga. */
  mapWin: 2,
} as const;

export type ScoutRules = typeof SCOUT_RULES;

/**
 * As estatísticas de **um mapa** para um jogador. Tudo anulável porque o
 * scoreboard do vlr às vezes vem incompleto (partida com forfeit, mapa
 * anulado) — ausente conta como zero de evento e não dispara faixa nenhuma,
 * nunca como `NaN`.
 */
export type MapStatInput = {
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  firstKills: number | null;
  firstDeaths: number | null;
  acs: number | null;
  kast: number | null;
  adr: number | null;
  rating: number | null;
  /** O jogador venceu este mapa? */
  won: boolean;
};

/** Pontos são gravados em `numeric(6,1)` — arredondar aqui evita 12.299999999. */
function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A primeira faixa que o valor alcança, de cima para baixo. Faixas não empilham. */
function tierPoints(
  stat: ScoutStat,
  value: number | null,
  rules: ScoutRules,
): number {
  if (value === null) return 0;
  const tier = rules.tiers.find((row) => row.stat === stat && value >= row.min);
  return tier ? tier.points : 0;
}

function penaltyPoints(
  stat: ScoutStat,
  value: number | null,
  rules: ScoutRules,
): number {
  if (value === null) return 0;
  const penalty = rules.penalties.find(
    (row) => row.stat === stat && value < row.below,
  );
  return penalty ? penalty.points : 0;
}

/** Pontuação fantasy de um jogador **em um mapa**. */
export function mapPoints(
  stat: MapStatInput,
  rules: ScoutRules = SCOUT_RULES,
): number {
  const { perEvent } = rules;

  const events =
    (stat.kills ?? 0) * perEvent.kill +
    (stat.deaths ?? 0) * perEvent.death +
    (stat.assists ?? 0) * perEvent.assist +
    (stat.firstKills ?? 0) * perEvent.firstKill +
    (stat.firstDeaths ?? 0) * perEvent.firstDeath;

  const bonuses =
    tierPoints("acs", stat.acs, rules) +
    tierPoints("kast", stat.kast, rules) +
    tierPoints("adr", stat.adr, rules) +
    tierPoints("rating", stat.rating, rules);

  const penalties = penaltyPoints("rating", stat.rating, rules);

  return roundToTenth(
    events + bonuses + penalties + (stat.won ? rules.mapWin : 0),
  );
}

/**
 * Pontuação de uma **série** (Bo3/Bo5) — a soma dos mapas, nunca a linha
 * agregada do vlr. Guardar o agregado junto dos mapas convidaria a somar duas
 * vezes; a série é uma soma, não um dado.
 */
export function seriesPoints(
  maps: readonly MapStatInput[],
  rules: ScoutRules = SCOUT_RULES,
): number {
  return roundToTenth(
    maps.reduce((total, stat) => total + mapPoints(stat, rules), 0),
  );
}
