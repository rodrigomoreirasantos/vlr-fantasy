# 26 — Regras de preço e saldo: time dos sonhos alcançável, desvalorização que pesa

> Destino no repositório: `.claude/plans/26-regras-de-preco-e-saldo.md` (este arquivo foi
> escrito no caminho do modo de planejamento; copiar para lá ao aprovar — regra do `CLAUDE.md`).
> Fonte do pedido: `prompts/26_fix_rules_player_price.md`. Corrige o plano
> `.claude/plans/20-preco-dos-jogadores-e-orcamento.md`, **totalmente implementado** no commit
> `e27fcaa`.

## Context

O pedido desfaz uma regra do plano 20 e endurece outra:

- **Desfaz:** o usuário **pode** escalar os 5 jogadores mais caros — desde que junte dinheiro para
  isso.
- **Mantém e calibra:** ele começa com dinheiro razoável, mas longe do time dos sonhos.
- **Endurece:** jogador que joga mal desvaloriza, e quem o escalou perde dinheiro na mesma medida
  — relevante, mas com limite.

Fatos do código e do banco (leitura feita em 12/09/2026, só consultas `SELECT`) que mudam o
pedido:

1. **O que proíbe o time dos sonhos é o teto de patrimônio, não o saldo inicial.**
   `MAX_PATRIMONY_CENTS = 36_000` (`lib/market/budget.ts:13`) contra `5 × MAX_PRICE_CENTS = 45_000`
   (`lib/scoring/pricing.ts:20`). O teste de guarda afirma isso de propósito:
   `"os 5 jogadores mais caros da liga nunca cabem no teto"` (`lib/market/budget.test.ts:34-36`).
   O fechamento corta o caixa de quem passa do teto (`db/close-round.ts:131-163`). Tirar o teto é
   condição necessária do pedido.
2. **O teto também está no banco.** `CHECK fantasy_team_balance_range BETWEEN 0 AND 36000`
   (`db/schema/fantasy-teams.ts:59-62`, migração `drizzle/0019_...sql`). Sem o teto, um usuário que
   valorizou e vendeu o elenco pode ter saldo > 360,0 — o CHECK derrubaria a venda.
3. **O time dos sonhos existe de verdade no catálogo.** Soma dos 5 mais caros ativos por região:
   Americas 450,0 · EMEA 450,0 · China 415,3 · Pacific 410,8 cr. Há 13 jogadores no teto de
   90,0 cr. Mediana de preço por região: 47,0–51,1 cr.
4. **O saldo inicial de 300,0 cr (`STARTING_BUDGET_CENTS`, `lib/market/budget.ts:10`) já é 67% de
   450,0** — longe do time dos sonhos, mas dá 5 medianos (≈ 240 cr) ou 2 estrelas + 3 baratos.
5. **O motor atual não pune o jogo ruim.** `priceDeltaCents` (`lib/scoring/pricing.ts:95-118`) faz
   o preço caminhar metade da distância até o alvo da **forma das últimas 5 séries**. A partida da
   rodada entra só como 1/5 da média. Um jogador com preço abaixo do alvo **valoriza mesmo depois
   de uma partida horrível**, e a seta "Valorizando" do mercado
   (`components/market/market-player-row.tsx:32-37`) já anuncia isso antes da rodada. Isso
   contradiz "fez um jogo ruim → desvaloriza".
6. **O prejuízo da desvalorização já existe, mas é invisível.** A venda credita o **preço atual**
   (`evaluateSale`, `lib/market/eligibility.ts:153`). Quem comprou a 90,0 e viu cair para 81,0
   recebe 81,0. O patrimônio (saldo + elenco) cai 9,0. Mas o número "Saldo" não se mexe no
   fechamento, e nenhuma tela diz "você perdeu 9,0 nesta rodada". Debitar o saldo **além disso**
   seria punir duas vezes pela mesma queda.
7. **Critério de "jogou" frágil.** O fechamento só mexe no preço de quem tem `row.score !== 0`
   (`db/close-round.ts:62`). Quem jogou e fez exatamente 0,0 ponto passa como "não jogou". Hoje não
   existe contagem de séries por jogador na rodada. `calculateRound` só grava a soma
   (`lib/vlr/jobs/calculate-round.ts:29-49`).
8. **Rodadas têm várias séries.** Por (jogador, rodada): 1 série em 1.001 casos, 2 em 384, 3 em
   147, 4+ em 39. Um preço baseado na soma da rodada premiaria quem jogou mais vezes, e isso já é
   premiado nos pontos do time.
9. **A régua real de uma série** (`player_match_stat` agrupado por partida): p10 14,3 · p25 33 ·
   p50 54 · p75 76,5 · p90 98 · p95 111,5. Desvio de uma série em relação à forma do jogador:
   p50 17 pts, p75 30 pts, p90 43,5 pts.
10. **Estado dos times:** 1 usuário, 5 times. Quatro estão vazios com saldo 300,0. O Internacional
    tem 5 jogadores (297,6 cr) e saldo 2,4 — patrimônio exatamente 300,0. `round_team_result` está
    vazio, então nenhum corte de teto foi gravado (`budget_trimmed_cents > 0`: 0 linhas). O banco é
    o Supabase de produção (planos 22/23).
11. **Consumidores do teto:** `components/team/budget-bar.tsx:3,45,66,74,81` (barra "Patrimônio /
    360,0" e a frase do corte), `lib/tour/steps.ts:95` (passo do tour "Os mais caros nunca cabem
    todos juntos"), `scripts/db/reprice.ts:63`, `lib/team/queries.ts:188`,
    `lib/team/mappers.ts:77,91`, `lib/team/types.ts:115-119`, `lib/round/queries.ts:142`,
    `lib/round/types.ts:86`, e os testes `db/close-round.test.ts`, `lib/market/budget.test.ts`,
    `components/team/budget-bar.test.tsx`, `lib/tour/steps.test.ts:83`,
    `components/team/team-stats.test.tsx:20`, `lib/home/summary.test.ts:29`.
12. **Consumidores do motor de preço:** `db/close-round.ts:63` (`nextPriceCents`),
    `lib/home/summary.ts:129` (projeção ao vivo da Home), `components/market/market-player-row.tsx:32`
    (seta de tendência). `targetPriceCents` e `DEBUT_PRICE_CENTS` continuam úteis em
    `rebasePlayerPrices` (`lib/vlr/jobs/calculate-round.ts:196`) e no nascimento do jogador
    (`lib/vlr/persist/players.ts:168`).
13. **As Server Actions de compra e venda não conhecem o teto.** `substitutePlayer` e `sellPlayer`
    (`app/(app)/my-team/actions.ts:52,152`) só usam `evaluateSubstitution`/`evaluateSale` dentro de
    `db.transaction`. Nada muda nelas.

**Resultado esperado:** o usuário começa cada região com 300,0 cr. Os 5 mais caros (até 450,0)
não cabem no começo, mas cabem quando ele fizer o patrimônio crescer. Todo jogador escalado
valoriza ou desvaloriza pelo jogo **daquela rodada** comparado ao que o preço dele promete, no
máximo ±10% do preço por rodada. "Meu Time" mostra em vermelho ou verde quanto a escalação ganhou
ou perdeu no último fechamento, e quanto falta para o time dos sonhos.

## Suposições (sem canal com o usuário nesta sessão — revisar antes de liberar a implementação)

O subagente que escreveu este plano não tinha `AskUserQuestion`. A entrevista foi feita contra o
código: cada pergunta foi respondida com a opção mais defensável, e **nada aqui é Decisão
confirmada**. Se o Rodrigo trocar alguma resposta, as fases que dependem dela estão indicadas.

| #   | Pergunta | Suposição adotada (e por quê) | Fases afetadas |
| --- | -------- | ----------------------------- | -------------- |
| S1  | Como a desvalorização vira perda de dinheiro: débito direto no saldo ou pelo patrimônio (saldo + valor do elenco)? | **Patrimônio.** A venda já paga o preço atual (fato 6). Debitar o saldo no fechamento **e** vender pelo preço caído cobraria a mesma queda duas vezes. Débito direto só seria coerente se a venda devolvesse o preço de compra, o que exige guardar o custo por vaga e mostra dois preços para o mesmo jogador (confuso). O prejuízo passa a ser **mostrado** a cada fechamento (S8). É o modelo do Cartola. | 0, 2, 3 |
| S2  | Saldo pode ficar negativo? | **Não.** Com S1, a desvalorização nunca mexe no saldo. O CHECK volta a ser `balance_cents >= 0`. | 1 |
| S3  | Teto de patrimônio: remover, subir ou trocar por outro limite? | **Remover.** Dinheiro acima de `5 × 90,0 = 450,0` não compra nada (preço máximo fixo), então o jogo já se limita sozinho. Um teto novo só atrasaria o time dos sonhos sem motivo. | 0, 1, 2, 3 |
| S4  | Saldo inicial: valor fixo ou regra relativa ao time mais caro? | **Fica 300,0 cr**, amarrado por teste de guarda a 5 × `MAX_PRICE_CENTS`: começa com menos que o time dos sonhos, mas com pelo menos 60% dele (hoje 66,7%). Alternativa descartada: 270,0 (60%) aperta o começo e obrigaria a recalcular o saldo do time Internacional, que já está montado. | 0 |
| S5  | Fórmula da variação por rodada. | **Desempenho contra a expectativa do preço.** Cada preço "promete" uma média de pontos por série, pela mesma régua do plano 20 (20,0 cr → 20 pts, 90,0 cr → 100 pts). No fechamento, `desvio = média por série na rodada − pontos prometidos`, e `variação = preço × 0,4% × desvio`. Motivo: jogo ruim sempre desvaloriza (fato 5), jogador caro precisa de jogo grande para não cair, e a média por série não premia quem jogou mais séries (fato 8). Substitui "caminhar até o alvo da forma". | 0, 2, 3 |
| S6  | Limites por rodada e piso. | **±10% do preço atual por rodada**, preço preso em **[20,0; 90,0]** (a faixa e o CHECK `player_price_cents_range` do plano 20 continuam). O limite proporcional garante que **a escalação nunca perde mais de 10% do valor numa rodada**. Estrela arrisca mais em créditos (até −9,0), barato arrisca pouco (até −2,0). | 0 |
| S7  | A valorização gera ganho simétrico? | **Sim.** Mesma sensibilidade e mesmo limite para cima. É o único jeito de o patrimônio crescer até o time dos sonhos. Assimetria que fica: quem já está em 90,0 não sobe mais, só desce. É o risco de pagar pela estrela. | 0 |
| S8  | Como o usuário **sente** a perda? | **Nova coluna `round_team_result.squad_valuation_cents`** (soma das variações dos jogadores escalados no fechamento). `BudgetBar` mostra: "Última rodada: sua escalação desvalorizou 9,0 cr" (vermelho) ou "valorizou" (verde). O header continua mostrando só o saldo (decisão do plano 12). | 1, 2, 3 |
| S9  | O que substitui a barra "Patrimônio / 360,0"? | **Barra de progresso rumo ao time dos sonhos:** patrimônio contra `ROSTER_SIZE × MAX_PRICE_CENTS` (450,0), com o texto "Faltam X cr para poder escalar os 5 mais caros". É uma constante, não a soma real da região (Pacific e China ficam em ≈ 410–415). Simples e nunca promete menos do que é preciso. | 0, 3 |
| S10 | O que substitui a seta "Valorizando/Desvalorizando" do mercado? | **"Valoriza com N+ pts"**: os pontos por série que o preço promete. Com S5 a seta da forma deixa de prever o preço e passaria a mentir. O novo número é a regra de verdade. | 3 |
| S11 | Quem conta como "jogou" na rodada? | **Quem tem pelo menos 1 série na rodada** (`count(distinct match_id)` de `player_match_stat`), não mais `score !== 0` (fato 7). Rede para o seed e para `pnpm db:round:close` manual, que não têm estatística: `score !== 0` sem série conta como 1 série. | 2 |
| S12 | Migrar usuários/times existentes. | **Nenhuma migração de dinheiro nem rebase de preço.** O saldo inicial não muda, o modelo de patrimônio não muda, e os preços atuais já estão na faixa, então o motor novo parte deles. Mudanças no banco: só o CHECK do saldo e a troca da coluna de corte pela de valorização (nunca houve corte gravado, fato 10). | 1 |
| S13 | Amortecimento de estreia (`dampingFactor`) e forma (`form_points`). | **Continuam.** A rampa 0,25/0,5/0,75/1 multiplica a variação nas 3 primeiras rodadas. `form_points` continua servindo ao preço de estreia e ao rebase de manutenção, mas sai do fechamento. | 0, 2 |

### A conta que sustenta as suposições

Constantes: `MIN = 20,0` · `MAX = 90,0` · `INICIAL = 300,0` · 5 vagas · régua 20→100 pts ·
sensibilidade 0,4%/pt · limite 10%.

`pontos prometidos(preço) = 20 + (preço − 20,0) ÷ 70,0 × 80`

| Jogador | Promete | Média na rodada | Desvio | Variação crua | Limitada | Novo preço |
| ------- | ------- | --------------- | ------ | ------------- | -------- | ---------- |
| 90,0 (estrela) | 100 pts | 50 | −50 | −20% | −10% → **−9,0** | 81,0 |
| 90,0 (estrela) | 100 pts | 120 | +20 | +8% | teto 90,0 → **0,0** | 90,0 |
| 48,0 (mediano) | 52 pts | 70 | +18 | +7,2% → +3,46 | **+3,5** | 51,5 |
| 48,0 (mediano) | 52 pts | 30 | −22 | −8,8% → −4,22 | **−4,2** | 43,8 |
| 25,0 (barato) | 25,7 pts | 60 | +34,3 | +13,7% | +10% → **+2,5** | 27,5 |
| 20,0 (piso) | 20 pts | 5 | −15 | −6% | piso 20,0 → **0,0** | 20,0 |

Invariantes (viram teste de guarda):

| Invariante | Conta | Vale? |
| ---------- | ----- | ----- |
| Os 5 mais caros não cabem no começo | 5 × 90,0 = 450,0 > 300,0 | sim |
| …mas o começo não frustra (≥ 60% do time dos sonhos) | 300,0 ≥ 270,0 | sim (66,7%) |
| Sempre dá para montar 5 com o mais caro | 90,0 + 4 × 20,0 = 170,0 ≤ 300,0 | sim |
| Perda máxima numa rodada ≤ 10% do elenco | limite por jogador é % do próprio preço | por construção |

Ritmo esperado: desvio típico de uma série = 17 pts (fato 9) → ≈ 6,8% de variação para um
jogador. Uma escalação bem escolhida que ganha ≈ 5% por rodada leva 300,0 a 450,0 em ≈ 8–9
rodadas (`ln 1,5 ÷ ln 1,05`). Uma que acerta 3% leva ≈ 14 rodadas. Uma que erra perde no máximo
10% por rodada. Cinco estrelas com rodada ruim: 450,0 → 405,0.

## Fase 0 — Domínio puro: motor de preço e orçamento

Sem banco, sem React (`CLAUDE.md`: pontuação e preço isolados em `lib/scoring/`).

**Arquivos**

- `lib/scoring/pricing.ts` — motor reescrito (mesmo arquivo).
- `lib/scoring/pricing.test.ts` — reescrito.
- `lib/market/budget.ts` — sem teto.
- `lib/market/budget.test.ts` — reescrito.

**O que muda em `lib/scoring/pricing.ts`**

Ficam: `MIN_PRICE_CENTS`, `MAX_PRICE_CENTS`, `DEBUT_PRICE_CENTS`, `FORM_FLOOR_POINTS`,
`FORM_CEILING_POINTS`, `dampingFactor`, `targetPriceCents` (só para estreia e rebase — atualizar o
JSDoc dizendo isso), `roundToStep`.

Saem: `MAX_STEP_CENTS`, `APPROACH_RATIO` (e o parâmetro `formPoints` de
`priceDeltaCents`/`nextPriceCents`).

Entram:

```ts
/** Variação por ponto de desvio: 0,4% do preço (Suposição S5, plano 26). */
export const PRICE_SENSITIVITY_PER_POINT = 0.004;

/** Limite de variação por rodada: ±10% do preço atual (Suposição S6, plano 26). */
export const MAX_SWING_RATIO = 0.1;

/**
 * Pontos por série que um preço "promete" — a inversa de `targetPriceCents`,
 * sem arredondar. 20,0 cr → 20 pts, 90,0 cr → 100 pts. É a régua que o mercado
 * mostra ("Valoriza com N+ pts") e que o fechamento compara com o jogo.
 */
export function expectedSeriesPoints(priceCents: number): number;

export type PriceMoveInput = {
  priceCents: number;
  /** Soma dos pontos do jogador na rodada (`player.score`). */
  roundPoints: number;
  /** Séries (partidas) que ele jogou na rodada. `0` = não jogou → variação 0. */
  series: number;
  /** Rodadas já pontuadas. Omitido = sem amortecimento. */
  gamesPlayed?: number;
};

export function priceDeltaCents(input: PriceMoveInput): number;
export function nextPriceCents(input: PriceMoveInput): number;
```

Regra de `priceDeltaCents`, sempre nesta ordem:

1. `series <= 0` → `0`.
2. `desvio = roundPoints / series − expectedSeriesPoints(priceCents)`.
3. `razão = clamp(desvio × PRICE_SENSITIVITY_PER_POINT, −MAX_SWING_RATIO, +MAX_SWING_RATIO)`.
4. `razão × dampingFactor(gamesPlayed)` (1 se omitido).
5. `bruto = roundToStep(priceCents × razão)`.
6. `final = clamp(priceCents + bruto, MIN_PRICE_CENTS, MAX_PRICE_CENTS)`.
7. devolve `final − priceCents`.

`nextPriceCents(x) = x.priceCents + priceDeltaCents(x)` continua sendo a invariante do CHECK
`round_player_score_delta_consistent`. Atualizar o comentário de topo (linhas 1-14) para descrever
o motor novo e apontar para este plano. Manter o aviso de calibração junto de
`FORM_FLOOR_POINTS`/`FORM_CEILING_POINTS`: agora a régua calibra também a expectativa.

**O que muda em `lib/market/budget.ts`**

- Sai `MAX_PATRIMONY_CENTS`, `budgetTrimCents`, `trimmedBalanceCents`.
- Fica `STARTING_BUDGET_CENTS = 30_000` e `patrimonyCents`.
- Entra:

```ts
import { MAX_PRICE_CENTS } from "@/lib/scoring/pricing";
import { ROSTER_SIZE } from "@/lib/team/types";

/** O time dos sonhos: 5 jogadores no preço máximo (450,0 cr) — a meta que a barra de "Meu Time" mostra. */
export const DREAM_TEAM_CENTS = ROSTER_SIZE * MAX_PRICE_CENTS;

/** Quanto falta de patrimônio para poder escalar os 5 mais caros — nunca negativo. */
export function dreamTeamGapCents(args: { balanceCents: number; squadValueCents: number }): number;

/**
 * Quanto a escalação ganhou ou perdeu num fechamento: soma de
 * `priceAfter − priceBefore` das vagas ocupadas. Vaga vazia soma 0.
 */
export function squadValuationCents(
  slots: readonly { priceBeforeCents: number; priceAfterCents: number }[],
): number;
```

Conferir que importar `lib/team/types.ts` a partir de `lib/market/budget.ts` não cria ciclo:
`budget.test.ts:11` já importa `ROSTER_SIZE` de lá. Se criar ciclo com `db/schema/fantasy-teams.ts`
(que importa `STARTING_BUDGET_CENTS`), declarar `DREAM_TEAM_CENTS` em `lib/market/budget.ts` com
`5` literal e deixar o teste de guarda comparar com `ROSTER_SIZE`.

**Testes** (Vitest, funções puras)

- `pricing.test.ts`:
  - `expectedSeriesPoints(2_000) === 20`, `(9_000) === 100`, `(4_800) === 52`.
  - A tabela de exemplos da seção "A conta" linha por linha: −900, 0, +350, −420, +250, 0.
  - `series: 0` → 0 mesmo com `roundPoints` alto.
  - A mesma soma em 2 séries vale metade do desvio de 1 série (média por série).
  - Para preços e pontos quaisquer, `|delta| <= priceCents × MAX_SWING_RATIO` (arredondado) e o
    preço final fica em `[MIN, MAX]`.
  - Jogo abaixo do prometido **nunca** dá delta positivo. Acima do prometido **nunca** dá negativo
    (a regra do pedido, escrita como teste).
  - `nextPriceCents(x) − x.priceCents === priceDeltaCents(x)`.
  - `gamesPlayed: 0` dá 25% da variação do veterano.
  - `targetPriceCents` continua com os testes atuais (estreia e rebase).
- `budget.test.ts` — teste de guarda com as 3 invariantes da tabela (`DREAM_TEAM_CENTS >
  STARTING_BUDGET_CENTS`, `STARTING_BUDGET_CENTS >= 0.6 × DREAM_TEAM_CENTS`, `MAX + 4 × MIN <=
  STARTING`). Mais: `dreamTeamGapCents` nunca negativo, `squadValuationCents` soma positivos e
  negativos. **Some** o teste "os 5 mais caros nunca cabem" e o literal `36_000`.

**Como verificar:** `pnpm test lib/scoring lib/market`. `pnpm exec tsc --noEmit` vai acusar de
propósito os chamadores das Fases 2-3.

## Fase 1 — Banco: saldo sem teto e coluna de valorização

**Arquivos**

- `db/schema/fantasy-teams.ts` — CHECK.
- `db/schema/round-results.ts` — coluna.
- `drizzle/0021_*.sql` + `drizzle/meta/` — gerados por `pnpm db:generate` (nunca editar à mão).
  Hoje a última é `drizzle/0020_lean_wildside.sql`.

**O que muda**

1. `fantasy_team`: `check("fantasy_team_balance_range", sql\`... BETWEEN 0 AND 36000\`)` vira
   `check("fantasy_team_balance_non_negative", sql\`${table.balanceCents} >= 0\`)`. Reescrever o
   comentário das linhas 50-58: sem teto de patrimônio (Suposição S3), o saldo só não pode ser
   negativo (S2).
2. `round_team_result`: sai `budgetTrimmedCents`, entra

```ts
/**
 * Quanto a escalação valorizou (positivo) ou desvalorizou (negativo) neste
 * fechamento: soma de `priceAfter − priceBefore` das 5 vagas (Suposição S8,
 * plano 26). É o "você perdeu X cr" que "Meu Time" mostra.
 */
squadValuationCents: integer("squad_valuation_cents").notNull().default(0),
```

⚠️ **`drizzle-kit generate` vai perguntar se `squad_valuation_cents` é uma coluna renomeada de
`budget_trimmed_cents`.** Responder **"create column"**, nunca "rename": os números de corte não
são valorização. É destrutivo só no papel, porque a tabela não tem nenhum corte gravado (fato 10).

A migração esperada tem só: `DROP CONSTRAINT fantasy_team_balance_range`, `ADD CONSTRAINT
fantasy_team_balance_non_negative CHECK (... >= 0)`, `ADD COLUMN squad_valuation_cents`, `DROP
COLUMN budget_trimmed_cents`. Nenhuma linha de dado precisa mudar: todo saldo atual já é ≥ 0.

**Testes:** nenhum teste de banco (regra do `CLAUDE.md`). A rede é o `tsc` acusando todo leitor de
`budgetTrimmedCents` (fato 11), resolvido nas Fases 2-3.

**Como verificar:** `pnpm db:generate` e leitura do SQL gerado (só os 4 comandos acima). Depois
`pnpm db:migrate` no banco de desenvolvimento. Como o `.env` aponta para o Supabase de produção
(fato 10), **fazer backup antes** (`pg_dump`, como no plano 20 Fase 3).

## Fase 2 — Consultas e fechamento de rodada

**Arquivos**

- `lib/round/queries.ts` — nova `listRoundSeriesCounts`, `listLiveRoundScores` ganha `series`, e o
  leitor de `roundTeamResult` (linhas 130-144) troca o campo.
- `lib/round/types.ts` — `LiveRoundScore.series: number`, `RoundTeamResult.squadValuationCents`
  no lugar de `budgetTrimmedCents` (linha 86).
- `db/close-round.ts` — motor novo, sem corte de teto.
- `db/close-round.test.ts` — reescrito nos trechos de preço e teto.
- `lib/home/summary.ts` + `lib/home/summary.test.ts` — projeção ao vivo.
- `lib/team/types.ts`, `lib/team/mappers.ts`, `lib/team/queries.ts` — `TeamSummary`.
- `scripts/db/reprice.ts` — sem teto.
- `lib/vlr/jobs/calculate-round.ts` — só comentários (linhas 21-23 e 179-184) apontando o motor
  novo.

**O que muda**

1. **`listRoundSeriesCounts(roundId, q: Querier = db): Promise<Map<string, number>>`** em
   `lib/round/queries.ts`, Drizzle puro no mesmo padrão de `listLiveRoundScores`:

```ts
const rows = await q
  .select({
    playerId: playerMatchStat.playerId,
    series: sql<number>`count(distinct ${playerMatchStat.matchId})::int`,
  })
  .from(playerMatchStat)
  .innerJoin(match, eq(match.id, playerMatchStat.matchId))
  .where(eq(match.roundId, roundId))
  .groupBy(playerMatchStat.playerId);
return new Map(rows.map((row) => [row.playerId, row.series]));
```

2. **`listLiveRoundScores`** (`lib/round/queries.ts:273`) seleciona também
   `series: sql<number>\`count(distinct ${playerMatchStat.matchId})::int\``. `formPoints` pode
   continuar no tipo (outros leitores), mas a projeção de preço não o usa mais.

3. **`closeActiveRound`** (`db/close-round.ts`), dentro da transação que já existe:
   - Passo 1 continua: `refreshPlayerForm(tx)` (forma e `gamesPlayed`).
   - Novo: `const seriesById = await listRoundSeriesCounts(activeRound.id, tx);`
   - `nextPriceById` (linhas 59-70) passa a:

```ts
const series = seriesById.get(row.id) ?? (row.score !== 0 ? 1 : 0); // Suposição S11
nextPriceCents({
  priceCents: row.priceCents,
  roundPoints: row.score,
  series,
  gamesPlayed: row.gamesPlayed,
});
```

   `nextPriceCents` já devolve o próprio preço quando `series === 0`, então o ternário
   `row.score !== 0 ? … : row.priceCents` sai.
   - No laço dos times: some `budgetTrimCents`/`trimmedBalanceCents` e **some o `UPDATE
     fantasy_team` inteiro** (linhas 150-163). O fechamento não mexe mais em saldo. Calcula
     `squadValuationCents(team.slots.filter(s => s.playerId).map(s => ({ priceBeforeCents:
     s.player!.priceCents, priceAfterCents: nextPriceById.get(s.playerId!)! })))` e grava em
     `roundTeamResult.squadValuationCents`. `squadValueCents` continua com os preços de antes
     (comportamento atual, lido por `patrimonyDeltaCents` da Home).
   - Atualizar o JSDoc do topo (linhas 26-37): sem "teto de patrimônio".
   - Tudo continua dentro do `Transaction` recebido. A assinatura `tx: Transaction` já impede
     chamada fora de transação (`CLAUDE.md`).

4. **`projectRoundHighlights`** (`lib/home/summary.ts:106-138`): `movers[].priceDeltaCents` passa a
   `priceDeltaCents({ priceCents, roundPoints: score.points, series: score.series, gamesPlayed })`.
   `projectedFormPoints` e o import de `FORM_WINDOW` saem se ficarem sem uso. Atualizar o JSDoc:
   a projeção agora é "o jogo até aqui contra o que o preço promete".

5. **`TeamSummary`** (`lib/team/types.ts:115-119`): `budgetTrimmedCents` vira
   `lastSquadValuationCents: number | null` (`null` = nenhuma rodada fechada ainda, e a tela não
   mostra a frase). `toTeamSummary` (`lib/team/mappers.ts:77,91`) e `getTeamOverview`
   (`lib/team/queries.ts:188`: `lastResult?.squadValuationCents ?? null`) acompanham.

6. **`scripts/db/reprice.ts:61-64`**: `balanceCents = Math.max(0, STARTING_BUDGET_CENTS −
   squadValueCents)`, sem `MAX_PATRIMONY_CENTS`. Comentário do topo sem teto. **Não rodar** este
   script como parte do plano (Suposição S12).

7. **Server Actions:** `substitutePlayer`/`sellPlayer` (`app/(app)/my-team/actions.ts`) **não
   mudam**. Continuam `next-safe-action` + `db.transaction` + `evaluateSubstitution`/`evaluateSale`.
   Nenhuma regra de teto vivia lá (fato 13).

**Testes** (banco mockado — `tx` falso como o `createTxStub` que já existe,
`db/close-round.test.ts:104`)

- `db/close-round.test.ts`:
  - Mockar `listRoundSeriesCounts` junto com `refreshPlayerForm` (novo `vi.mock` de
    `@/lib/round/queries`, no mesmo padrão das linhas 7-18).
  - Trocar `PLAYER_A`/`PLAYER_B` (linhas 49-66): um jogador de 48,0 cr com jogo acima do prometido
    e um de 90,0 cr com jogo ruim. Os `*_NEXT_PRICE` vêm de `nextPriceCents`, não mais de
    `MAX_STEP_CENTS`.
  - Jogador sem série e com `score 0` → preço idêntico, delta 0.
  - Jogador com série e `score 0` → **desvaloriza** (fato 7).
  - Jogador sem série mas com `score !== 0` (caso seed) → tratado como 1 série.
  - `round_team_result.squadValuationCents` = soma dos deltas das vagas ocupadas (negativo no
    cenário ruim).
  - **Nenhum** `update(fantasy_team)` é emitido no fechamento, mesmo com patrimônio > 450,0.
  - Removem-se os testes de corte (linhas ≈ 492-583) e o import de `MAX_PATRIMONY_CENTS`.
- `lib/round/queries.test.ts`: contrato de `listRoundSeriesCounts` com querier mockado (monta a
  consulta e devolve o `Map`).
- `lib/home/summary.test.ts`: um mover com jogo abaixo do prometido projeta delta negativo. A
  fixture da linha 29 troca `budgetTrimmedCents` pelo campo novo.
- `lib/vlr/jobs/calculate-round.test.ts`: sem mudança de comportamento. Só confirmar que continua
  verde.

**Como verificar:** `pnpm test db lib/round lib/home lib/team` · `pnpm exec tsc --noEmit` sem erros
fora das telas da Fase 3.

## Fase 3 — Telas: prejuízo visível, meta do time dos sonhos, regra no mercado

Usar a skill `frontend-design`. Identidade dark Valorant, **nenhuma cor hard-coded**: só
`text-destructive`, `text-success`, `text-info`, `text-muted-foreground`, que já são usadas por
`budget-bar.tsx` e `market-player-row.tsx`. `Progress` do shadcn já instalado
(`components/ui/progress.tsx`). Toda moeda por `formatCredits`/`PlayerPrice`
(`lib/market/money.ts`).

**Arquivos**

- `components/team/budget-bar.tsx` + `components/team/budget-bar.test.tsx`
- `app/(app)/my-team/page.tsx` (linhas 68-72: prop nova)
- `components/market/market-player-row.tsx` + `components/market/market-player-row.test.tsx`
- `lib/tour/steps.ts` (linha 90-96) + `lib/tour/steps.test.ts` (linhas 80-84)
- `components/team/team-stats.test.tsx:20` (fixture)

**O que muda**

1. **`BudgetBar`**: props `balanceCents`, `squadValueCents`, `lastSquadValuationCents: number |
   null`.
   - Os três números ficam: Saldo, Valor do elenco, Patrimônio (sem "/ 360,0").
   - A barra vira `Progress value={min(patrimônio, DREAM_TEAM_CENTS)} max={DREAM_TEAM_CENTS}
     aria-label="Patrimônio rumo ao time dos sonhos"`.
   - Legenda abaixo: `dreamTeamGapCents > 0` → "Faltam {X} cr para poder escalar os 5 mais
     caros." Senão → "Você já pode escalar os 5 mais caros."
   - Linha da última rodada (só quando `lastSquadValuationCents !== null && !== 0`): negativo →
     `text-destructive` "Última rodada: sua escalação desvalorizou {X} cr." Positivo →
     `text-success` "Última rodada: sua escalação valorizou {X} cr." Usar `formatCreditsDelta`
     se ele existir em `lib/market/money.ts` (já usado em `components/home/round-recap.tsx:66`)
     para não formatar sinal na mão.
   - JSDoc aponta para este plano.
2. **`MarketPlayerRow`**: `priceTrend`/`PriceTrendBadge` (linhas 23-70) saem. No lugar, um texto
   pequeno ao lado do preço: `Valoriza com {Math.ceil(expectedSeriesPoints(candidate.priceCents))}+
   pts`, com `title`/`aria-label` "Precisa de N pontos por série para valorizar". Imports de
   `TrendingUp/TrendingDown/Minus` e `targetPriceCents` saem se ficarem sem uso. É a mesma função
   que o fechamento usa: a regra não é reescrita na UI (`CLAUDE.md`, componentes reutilizáveis).
3. **Tour** (`lib/tour/steps.ts:90-96`): título "Patrimônio", corpo "Jogador que joga mal
   desvaloriza e seu patrimônio cai junto (até 10% por rodada). Faça crescer para escalar os 5
   mais caros." Formatar o 10% a partir de `MAX_SWING_RATIO`, não como literal.

**Testes** (React Testing Library, queries por role/label/text — skill `react-testing-library`)

- `budget-bar.test.tsx`:
  - `getByRole("progressbar", { name: /time dos sonhos/i })` com `aria-valuemax =
    DREAM_TEAM_CENTS`.
  - Patrimônio acima de 450,0 → `aria-valuenow = DREAM_TEAM_CENTS` e texto "Você já pode
    escalar".
  - Valorização −900 → texto "desvalorizou 9,0" visível. +350 → "valorizou 3,5".
  - `null` e `0` → nenhuma frase de última rodada.
  - Nenhuma menção a "teto".
- `market-player-row.test.tsx`: candidato de 90,0 cr mostra "Valoriza com 100+ pts". De 48,0 cr
  mostra "52+". O bloqueio "Sem saldo" continua. Remover os testes da seta.
- `lib/tour/steps.test.ts`: o passo `orcamento` não contém mais o valor do teto e menciona o
  limite de 10%.

**Como verificar:** `pnpm test components lib/tour` e na tela (`pnpm dev`, feito por quem
implementa): em `/my-team` conferir Saldo + Valor do elenco = Patrimônio, a barra contra 450,0 e a
frase "Faltam …". Abrir o mercado e ver "Valoriza com N+ pts" no lugar da seta.

## Fase 4 — Fechamento

- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.
- `grep` sem resultado para `MAX_PATRIMONY_CENTS`, `budgetTrim`, `trimmedBalanceCents`,
  `budgetTrimmedCents`, `budget_trimmed_cents` (fora de `drizzle/` histórico), `MAX_STEP_CENTS`,
  `APPROACH_RATIO`.
- `grep` de `formPoints:` em chamadas de `priceDeltaCents`/`nextPriceCents` sem resultado (a
  assinatura mudou).
- Acrescentar ao fim de `.claude/plans/20-preco-dos-jogadores-e-orcamento.md` uma nota "Revisto
  pelo plano 26: teto de patrimônio removido, motor de preço trocado" — sem reescrever o plano 20.

## Riscos e o que fica de fora

- **O prejuízo não aparece no header.** O header segue mostrando só o saldo (plano 12). Quem nunca
  abre "Meu Time" não vê a frase da desvalorização. Se isso não bastar como "punição sentida",
  trocar o header para patrimônio é outro plano.
- **Estrela no teto só pode cair** (S7). Um jogador que faz 120 pts parado em 90,0 não valoriza.
  É intencional (o risco de pagar caro), mas deixa os 13 jogadores em 90,0 com tendência de queda
  nas primeiras rodadas: a forma de 5 séries que os levou lá costuma ser pico, e a média real é
  menor. Espera-se uma "correção" visível logo após o deploy.
- **Calibração com poucos dados.** 0,4%/pt e 10% foram escolhidos sobre a distribuição atual
  (fato 9). Mudar `SCOUT_RULES` (`lib/scoring/scout.ts`) sem recalibrar
  `FORM_FLOOR_POINTS`/`FORM_CEILING_POINTS` desloca a expectativa inteira. Deixar o aviso no
  comentário de `pricing.ts`.
- **Crescimento sem teto:** patrimônio pode passar de 450,0, mas não compra nada a mais. O ranking
  é por pontos (`rankStandings`, `lib/championship/standings.ts:14`), então dinheiro sobrando não
  dá vantagem.
- **Meta constante de 450,0** (S9) é maior que o time dos sonhos real de Pacific e China
  (≈ 410–415). A barra promete um pouco mais do que é preciso ali. Nunca menos.
- **Destaques de rodadas antigas** (`round_player_score`) foram gravados pelo motor do plano 20 e
  pelo anterior. História congelada não se reescreve.
- **Fora de escopo, de propósito:**
  - débito direto no saldo e preço de compra por vaga (S1);
  - saldo negativo ou dívida (S2);
  - rebase de preços ou recálculo de saldos existentes (S12);
  - header com patrimônio;
  - histórico de valorização por jogador numa tela nova;
  - mudar a janela da forma ou o ranking;
  - saldo inicial diferente por região.
