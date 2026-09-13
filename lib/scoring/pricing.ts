/**
 * Motor de preço — a metade `desempenho → preço` da camada de pontuação que
 * o CLAUDE.md exige isolada do banco e dos componentes. Fechar uma rodada
 * (`db/close-round.ts`) chama `nextPriceCents` para cada jogador do catálogo;
 * `priceDeltaCents` isolado serve tanto para gravar `round_player_score`
 * quanto para os testes de invariante abaixo.
 *
 * Preço é sempre uma **promessa de pontos por série** (Suposição S5,
 * `.claude/plans/26-regras-de-preco-e-saldo.md`): cada preço, pela mesma
 * régua de `targetPriceCents`, promete uma média de pontos por série
 * (`expectedSeriesPoints`). A cada rodada, o preço anda proporcional ao
 * desvio entre o que o jogador realmente fez (média por série na rodada) e o
 * que o preço dele prometia — nunca mais que `MAX_SWING_RATIO` do preço
 * atual. Substitui o motor anterior (`.claude/plans/20-preco-dos-jogadores-e-orcamento.md`),
 * que caminhava metade da distância até o alvo da **forma das últimas 5
 * séries** — e por isso podia valorizar um jogador logo depois de uma
 * partida ruim, contradizendo a regra do plano 26: jogo ruim sempre
 * desvaloriza, jogo bom sempre valoriza.
 */

/** Piso de 20,0 créditos — `player_price_cents_range` exige `>= isto`. */
export const MIN_PRICE_CENTS = 2_000;

/** Teto de 90,0 créditos — `player_price_cents_range` exige `<= isto`. */
export const MAX_PRICE_CENTS = 9_000;

/** Preço de estreia: 30,0 créditos, para quem ainda não tem forma (Decisão 8, plano 20). */
export const DEBUT_PRICE_CENTS = 3_000;

/**
 * A régua `forma → preço` é linear entre estes dois pontos: uma forma no
 * piso (ou abaixo) vale `MIN_PRICE_CENTS`, uma forma no teto (ou acima) vale
 * `MAX_PRICE_CENTS`. Calibrados sobre os percentis reais do circuito — p10 =
 * 22,9, p99 = 103,7 pontos por série (fato 9 do plano 20).
 *
 * ⚠️ **Calibrados sobre a distribuição atual de `fantasy_points`**
 * (`SCOUT_RULES`, `SCOUT_VERSION`, `lib/scoring/scout.ts`). Mudar as regras
 * de pontuação sem recalibrar estes dois números desloca a faixa de preço
 * inteira — e, com o motor do plano 26, desloca também a expectativa que
 * `expectedSeriesPoints` compara contra o jogo real: some ou fica fácil
 * demais bater o teto.
 */
export const FORM_FLOOR_POINTS = 20;
export const FORM_CEILING_POINTS = 100;

/**
 * Variação por ponto de desvio entre o jogo real e o prometido: 0,4% do
 * preço atual por ponto (Suposição S5, plano 26).
 */
export const PRICE_SENSITIVITY_PER_POINT = 0.004;

/**
 * Limite de variação por rodada: no máximo ±10% do preço atual (Suposição
 * S6, plano 26). É o que garante que uma escalação nunca perde (nem ganha)
 * mais de 10% do valor numa única rodada.
 */
export const MAX_SWING_RATIO = 0.1;

/** Preço sempre em múltiplo de 10 centavos — a UI mostra uma casa decimal (`formatCredits`). */
function roundToStep(cents: number): number {
  return Math.round(cents / 10) * 10;
}

/**
 * Amortecimento das primeiras rodadas de um jogador. Um jogador recém-chegado
 * ao catálogo tem uma amostra pequena demais para justificar a variação
 * cheia: uma partida excepcional na estreia moveria o preço tanto quanto a de
 * um veterano, em cima de uma amostra de uma série só.
 *
 * Rampa: 0.25 na 1ª rodada, 0.5 na 2ª, 0.75 na 3ª, 1.0 da 4ª em diante.
 * `gamesPlayed` é o número de rodadas **já** pontuadas — 0 é a estreia.
 */
export function dampingFactor(gamesPlayed: number): number {
  const factors = [0.25, 0.5, 0.75];
  return factors[Math.max(0, Math.trunc(gamesPlayed))] ?? 1;
}

/**
 * O preço justo de uma forma — interpolação linear entre `MIN_PRICE_CENTS`
 * (em `FORM_FLOOR_POINTS` ou abaixo) e `MAX_PRICE_CENTS` (em
 * `FORM_CEILING_POINTS` ou acima). `null` (sem histórico nenhum, nunca `0`
 * — ver `lib/scoring/form.ts`) devolve o preço de estreia: zero é um jogador
 * ruim de verdade, ausência é um jogador desconhecido, e os dois merecem
 * preços diferentes.
 *
 * Usada só para o preço de **estreia** e o rebase de manutenção
 * (`rebasePlayerPrices`, `lib/vlr/jobs/calculate-round.ts`) — o fechamento de
 * rodada (`nextPriceCents` abaixo) não caminha mais até este alvo pela forma;
 * ele compara o jogo da rodada contra `expectedSeriesPoints`.
 */
export function targetPriceCents(formPoints: number | null): number {
  if (formPoints === null) return DEBUT_PRICE_CENTS;
  if (formPoints <= FORM_FLOOR_POINTS) return MIN_PRICE_CENTS;
  if (formPoints >= FORM_CEILING_POINTS) return MAX_PRICE_CENTS;

  const ratio =
    (formPoints - FORM_FLOOR_POINTS) / (FORM_CEILING_POINTS - FORM_FLOOR_POINTS);
  const raw = MIN_PRICE_CENTS + ratio * (MAX_PRICE_CENTS - MIN_PRICE_CENTS);
  return roundToStep(raw);
}

/**
 * Pontos por série que um preço "promete" — a inversa de `targetPriceCents`,
 * sem arredondar nem prender à faixa de forma. 20,0 cr → 20 pts, 90,0 cr →
 * 100 pts. É a régua que o mercado mostra ("Valoriza com N+ pts",
 * `components/market/market-player-row.tsx`) e que o fechamento
 * (`priceDeltaCents`) compara com o jogo de verdade.
 */
export function expectedSeriesPoints(priceCents: number): number {
  const ratio = (priceCents - MIN_PRICE_CENTS) / (MAX_PRICE_CENTS - MIN_PRICE_CENTS);
  return FORM_FLOOR_POINTS + ratio * (FORM_CEILING_POINTS - FORM_FLOOR_POINTS);
}

export type PriceMoveInput = {
  priceCents: number;
  /** Soma dos pontos do jogador na rodada (`player.score`). */
  roundPoints: number;
  /** Séries (partidas) que ele jogou na rodada. `0` = não jogou → variação 0. */
  series: number;
  /** Rodadas já pontuadas. Omitido = sem amortecimento. */
  gamesPlayed?: number;
};

/**
 * Variação de preço já com o limite de rodada, o amortecimento e a faixa
 * aplicados — nunca o delta "cru". É o que mantém a invariante
 * `nextPriceCents(x) - x === priceDeltaCents(x)` verdadeira por construção
 * (ambas as funções aplicam exatamente esta mesma regra), e por consequência
 * o `CHECK round_player_score_delta_consistent` do banco.
 *
 * Ordem, sempre:
 * 1. sem série (`series <= 0`) → delta `0` — jogador que não jogou não mexe
 *    de preço.
 * 2. `desvio = média de pontos por série da rodada − expectedSeriesPoints(preço)`.
 * 3. razão = `desvio × PRICE_SENSITIVITY_PER_POINT`, presa a
 *    `±MAX_SWING_RATIO`.
 * 4. razão × amortecimento (`dampingFactor`, 1 se `gamesPlayed` omitido).
 * 5. arredonda ao múltiplo de 10 centavos, soma ao preço, prende em
 *    `[MIN_PRICE_CENTS, MAX_PRICE_CENTS]` → devolve a diferença.
 *
 * A média **por série**, não a soma da rodada: um jogador que disputou 2
 * mapas não deve valorizar o dobro de outro que disputou 1 só com o mesmo
 * desempenho por mapa — esse prêmio por jogar mais já existe na pontuação do
 * time (fato 8, plano 26).
 */
export function priceDeltaCents(input: PriceMoveInput): number {
  const { priceCents, roundPoints, series, gamesPlayed } = input;
  if (series <= 0) return 0;

  const pointsPerSeries = roundPoints / series;
  const deviation = pointsPerSeries - expectedSeriesPoints(priceCents);
  const rawRatio = deviation * PRICE_SENSITIVITY_PER_POINT;
  const cappedRatio = Math.max(-MAX_SWING_RATIO, Math.min(MAX_SWING_RATIO, rawRatio));
  const damping = gamesPlayed === undefined ? 1 : dampingFactor(gamesPlayed);

  const rawDeltaCents = roundToStep(priceCents * cappedRatio * damping);
  const clampedPriceCents = Math.max(
    MIN_PRICE_CENTS,
    Math.min(MAX_PRICE_CENTS, priceCents + rawDeltaCents),
  );
  return clampedPriceCents - priceCents;
}

/** Novo preço do jogador após a rodada — `priceCents + priceDeltaCents(input)`. */
export function nextPriceCents(input: PriceMoveInput): number {
  return input.priceCents + priceDeltaCents(input);
}
