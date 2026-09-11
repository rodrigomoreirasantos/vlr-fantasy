/**
 * Motor de preço — a metade `forma → preço` da camada de pontuação que o
 * CLAUDE.md exige isolada do banco e dos componentes. Fechar uma rodada
 * (`db/close-round.ts`) chama `nextPriceCents` para cada jogador do catálogo;
 * `priceDeltaCents` isolado serve tanto para gravar `round_player_score`
 * quanto para os testes de invariante abaixo.
 *
 * Preço é sempre um **alvo pela forma** (Decisão 1, `.claude/plans/20-preco-dos-jogadores-e-orcamento.md`):
 * cada jogador tem um preço justo derivado da média das últimas 5 séries
 * (`lib/scoring/form.ts`), e a cada rodada o preço caminha metade da
 * distância até esse alvo, no máximo `MAX_STEP_CENTS`. Substitui o delta
 * acumulativo antigo (`preço += (pontos − média da rodada) × 2,0`), que nunca
 * voltava para uma faixa.
 */

/** Piso de 20,0 créditos — `player_price_cents_range` exige `>= isto`. */
export const MIN_PRICE_CENTS = 2_000;

/** Teto de 90,0 créditos — `player_price_cents_range` exige `<= isto`. */
export const MAX_PRICE_CENTS = 9_000;

/** Preço de estreia: 30,0 créditos, para quem ainda não tem forma (Decisão 8). */
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
 * inteira — some ou fica fácil demais bater o teto.
 */
export const FORM_FLOOR_POINTS = 20;
export const FORM_CEILING_POINTS = 100;

/** Passo máximo de variação por rodada: 8,0 créditos (Decisão 1). */
export const MAX_STEP_CENTS = 800;

/** Fração da distância até o alvo percorrida a cada rodada (Decisão 1). */
export const APPROACH_RATIO = 0.5;

/** Preço sempre em múltiplo de 10 centavos — a UI mostra uma casa decimal (`formatCredits`). */
function roundToStep(cents: number): number {
  return Math.round(cents / 10) * 10;
}

/**
 * Amortecimento das primeiras rodadas de um jogador. Um jogador recém-chegado
 * ao catálogo tem uma amostra pequena demais para justificar o passo cheio:
 * uma partida excepcional na estreia moveria o preço tanto quanto a de um
 * veterano, em cima de uma forma que ainda é uma amostra de uma série só.
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
 * Variação de preço já com o passo máximo, o amortecimento e a faixa
 * aplicados — nunca o delta "cru". É o que mantém a invariante
 * `nextPriceCents(x) - x === priceDeltaCents(x)` verdadeira por construção
 * (ambas as funções aplicam exatamente esta mesma regra), e por consequência
 * o `CHECK round_player_score_delta_consistent` do banco.
 *
 * Ordem, sempre: alvo pela forma → fração da distância (com amortecimento) →
 * arredonda ao múltiplo de 10 centavos → limita a `±MAX_STEP_CENTS` → soma
 * ao preço → prende em `[MIN_PRICE_CENTS, MAX_PRICE_CENTS]` → devolve a
 * diferença.
 */
export function priceDeltaCents(args: {
  priceCents: number;
  formPoints: number | null;
  /** Rodadas já pontuadas pelo jogador. Omitido = sem amortecimento. */
  gamesPlayed?: number;
}): number {
  const { priceCents, formPoints, gamesPlayed } = args;

  const targetCents = targetPriceCents(formPoints);
  const damping = gamesPlayed === undefined ? 1 : dampingFactor(gamesPlayed);
  const rawDeltaCents = roundToStep(
    (targetCents - priceCents) * APPROACH_RATIO * damping,
  );
  const cappedDeltaCents = Math.max(
    -MAX_STEP_CENTS,
    Math.min(MAX_STEP_CENTS, rawDeltaCents),
  );

  const clampedPriceCents = Math.max(
    MIN_PRICE_CENTS,
    Math.min(MAX_PRICE_CENTS, priceCents + cappedDeltaCents),
  );
  return clampedPriceCents - priceCents;
}

/** Novo preço do jogador após a rodada — `priceCents + priceDeltaCents(args)`. */
export function nextPriceCents(args: {
  priceCents: number;
  formPoints: number | null;
  gamesPlayed?: number;
}): number {
  return args.priceCents + priceDeltaCents(args);
}
