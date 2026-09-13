# Preço dos jogadores e orçamento do usuário

## Context

O pedido (`prompts/20_players_price_money.md`) quer três coisas ao mesmo tempo: preço que
valoriza/desvaloriza pelos stats reais, dinheiro "mais real" em relação aos preços (o usuário
tem que fazer conta para encaixar 5 jogadores) e um teto que impeça o elenco all-star — com o
ranking continuando por pontos.

Os fatos do código e do banco que mudam esse pedido (números medidos no banco de
desenvolvimento em 11/09/2026, 596 jogadores ativos):

1. **O preço de hoje não tem faixa nenhuma.** `priceDeltaCents`
   (`lib/scoring/pricing.ts:45`) faz `preço += (pontos − média da rodada) × 2,0 cr`, limitado a
   ±15% do próprio preço (`MAX_SWING_RATIO`, `lib/scoring/pricing.ts:13`) e com piso de 10,0 cr
   (`MIN_PRICE_CENTS`, `lib/scoring/pricing.ts:16`). Não existe teto: o preço é uma soma que
   acumula para sempre.
2. **O saldo inicial é 200,0 cr por região** (`INITIAL_BALANCE_CENTS = 20_000`,
   `db/schema/fantasy-teams.ts:16`), igual para as cinco regiões, e é o único limite da
   escalação.
3. **Um único jogador já custa mais que todo o dinheiro do usuário.** O mais caro do catálogo é
   Demon1, 523,4 cr — 2,6× o saldo inicial. Os cinco mais caros de Americas somam 1.482,6 cr
   contra 200,0 cr de saldo. Ou seja: a regra que o pedido quer ("nunca um jogador consome tudo")
   hoje é obtida por acidente — por inanição, não por desenho.
4. **Dois terços do catálogo têm preço de mentira.** 402 dos 596 ativos estão no piso de 10,0 cr;
   397 deles **já têm estatísticas no banco** e mesmo assim estão com `average_score = 0` e
   `games_played = 0`. Causa imediata: `refreshPlayerAggregates` só deriva preço com
   `case when price_cents = MIN_PRICE_CENTS` (`lib/vlr/jobs/calculate-round.ts:141`) e só roda no
   backfill — quem ganhou stats depois nunca foi reprecificado.
5. **Os jogadores mais caros do jogo são sobras do seed.** 15 jogadores ativos não têm `vlr_id`
   (vieram de `db/seed.ts`, preços escritos à mão entre 50,0 e 480,0 cr — `db/seed.ts:60-284`);
   6 deles estão entre os 20 mais caros: Demon1 (523,4), Vulcan (475,4), ANGE1 (457,0), Zekken
   (430,2) — todos com `games_played = 0`.
6. **Duas escalas convivem no mesmo catálogo:** a do seed (50,0–480,0 cr, escrita à mão) e a
   derivada do vlr (`average_score × 2,0 cr`, `lib/vlr/jobs/calculate-round.ts:131-134`), que dá
   10,0–252,0 cr. Nenhuma das duas conversa com o saldo de 200,0 cr.
7. **Não existe nenhuma trava de orçamento além do saldo.** `evaluateSubstitution`
   (`lib/market/eligibility.ts:104`) bloqueia só por `netCostCents > balanceCents`; não há
   limite de quantos caros cabem, nem teto de patrimônio. Comprar/vender é conservativo (troca
   caixa por elenco), mas a **valorização** cria patrimônio do nada a cada rodada
   (`db/close-round.ts:132-144`) e ninguém limita esse acúmulo.
8. **O ranking já é por pontos** (`rankStandings`, `lib/championship/standings.ts:14`) e lê
   `round_team_result.points` — dinheiro não entra. Nada nesta parte precisa mudar.
9. **A forma real do circuito, medida:** pontos por série (soma dos mapas de uma partida),
   média das últimas 5 séries de cada jogador, 582 jogadores com histórico —
   mín. −12,5 · p10 22,9 · p25 37,2 · **p50 52,1** · p75 66,0 · p90 80,2 · p99 103,7 ·
   máx. 120,4. É essa a régua em que uma faixa de preço tem que caber.
10. **O estado atual dos times é quase vazio:** 5 times fantasy (um usuário), 4 sem nenhum
    jogador, 1 (international) com um jogador de 115,4 cr e saldo 84,6 cr — esse único jogador
    come 58% do dinheiro. 15 transferências, 2 rodadas fechadas (48 linhas em
    `round_player_score`), 0 campeonatos criados.
11. Outro desvio menor: `refreshPlayerAggregates` usa `games = max(rodadas, partidas, 1)`
    (`lib/vlr/jobs/calculate-round.ts:125`), então `gamesPlayed` — que alimenta o amortecimento
    de `dampingFactor` — conta partidas quando deveria contar rodadas.
12. **Causa-raiz real dos 397 jogadores com preço de mentira: ninguém chama a função.**
    `refreshPlayerAggregates` tem **um único chamador em todo o repositório** — `backfill()`
    (`lib/vlr/jobs/backfill.ts:35`). Nem `runRoundJob` (`lib/vlr/jobs/calculate-round.ts:65`),
    nem `workQueue` (`lib/vlr/jobs/work.ts:28`), nem `scrapeMatch`/`reprocessMatch`
    (`lib/vlr/jobs/scrape-match.ts:31,47`) a chamam. O `case when price_cents =
    MIN_PRICE_CENTS` (fato 4) é o sintoma; a causa é que o agregado só é recalculado numa carga
    histórica manual.
13. **`average_score` é escrito e nunca lido.** Único write em
    `lib/vlr/jobs/calculate-round.ts:140`; zero leitores em `lib/`, `app/`, `components/`. O
    schema (`db/schema/players.ts:102`) a documenta como "base do preço inicial do backfill" —
    papel que a Decisão 2 transfere para `form_points`.
14. **`games_played` tem dois donos com semânticas diferentes.** `refreshPlayerAggregates`
    **atribui** `max(rounds, matches, 1)` (`calculate-round.ts:125`); `closeActiveRound`
    **incrementa** `+1` só para quem atuou (`db/close-round.ts:141`). Rodar o backfill depois de
    uma rodada fechada sobrescreve o contador incrementado — e é ele que alimenta
    `dampingFactor`.
15. **`reprocessMatch` não repreça.** `pnpm vlr:reprocess --match=X`
    (`scripts/vlr/reprocess.ts:19`) reparsa o HTML salvo e regrava `player_match_stat` — é o
    caminho oficial de corrigir uma regra de scout — mas não toca em agregado nem preço: o preço
    continua refletindo a regra antiga.
16. **`createPlayer` promete o que ninguém cumpre.** `lib/vlr/persist/players.ts:164-166` nasce
    no piso com o comentário "o backfill recalcula a partir da média real assim que houver
    histórico" — promessa válida só se um humano rodar `pnpm vlr:backfill` outra vez.

**Resultado esperado:** todo jogador custa entre 20,0 e 90,0 créditos, o preço persegue a forma
recente dele (últimas 5 séries) subindo ou descendo no máximo 8,0 cr por rodada, cada time começa
com 300,0 créditos e nunca passa de 360,0 de patrimônio — escalar dois craques obriga a economizar
nos outros três, e os cinco melhores da liga (450,0) jamais cabem no mesmo time.

## Decisões (fechadas na entrevista — não reabrir)

| #   | Decisão                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Motor de preço = alvo pela forma.** Cada jogador tem um "preço justo" derivado da média de pontos das últimas 5 séries; a cada fechamento de rodada o preço caminha metade da distância até esse alvo, no máximo 8,0 cr. Substitui o delta acumulativo de hoje, que nunca volta para faixa nenhuma. |
| 2   | **Escala: orçamento 300,0 cr, preços de 20,0 a 90,0 cr.** Com a forma real do banco (fato 9) isso dá mediana ≈ 48,1 cr, p90 ≈ 72,7 cr e estrela = 90,0 cr.                                                                                                                             |
| 3   | **Teto de patrimônio = 360,0 cr (1,2× o orçamento inicial).** Patrimônio = saldo + soma dos preços dos 5. O usuário continua lucrando com quem valoriza, mas o lucro para de contar no teto.                                                                                            |
| 4   | O corte do teto mexe **só no caixa**, nunca vende jogador: se o elenco sozinho valer mais que o teto, o time simplesmente fica com saldo 0. Confiscar jogador de alguém seria pior que o problema.                                                                                       |
| 5   | O corte é aplicado **no fechamento da rodada**, depois de gravados os snapshots. Durante a janela de mercado nenhuma jogada é bloqueada pelo teto — comprar e vender não criam patrimônio, só a valorização cria.                                                                        |
| 6   | **A venda continua pelo preço atual** do jogador (`evaluateSale`, `lib/market/eligibility.ts:145`). É o que o pedido chama de "ganhar dinheiro vendendo quem performou bem".                                                                                                            |
| 7   | **Só quem pontuou na rodada tem o preço mexido** (mesmo critério que `close-round.ts:141` já usa para `gamesPlayed`). Quem não entrou em quadra não valoriza nem desvaloriza.                                                                                                           |
| 8   | **Quem não tem histórico nasce a 30,0 cr** (preço de estreia), e o amortecimento de `dampingFactor` (`lib/scoring/pricing.ts:33`) continua valendo nas 3 primeiras rodadas dele.                                                                                                        |
| 9   | **Migração: repreça tudo e recalcula o saldo.** Ninguém perde jogador: cada time recebe `saldo = max(0, 300,0 − valor do elenco repreçado)`. Os snapshots de rodadas já fechadas ficam como estão — história congelada não se reescreve.                                                  |
| 10  | **Nenhuma regra extra de "máximo N estrelas".** A faixa de preço + o teto de patrimônio já tornam o elenco all-star impossível por aritmética; uma segunda regra seria ruído na tela.                                                                                                   |
| 11  | O ranking **não muda** (fato 8). Dinheiro nunca entra em classificação.                                                                                                                                                                                                                |

## Aritmética que sustenta as decisões

Com `MIN = 20,0` · `MAX = 90,0` · `ORÇAMENTO = 300,0` · `TETO = 360,0` · 5 vagas:

| Invariante                                   | Conta                    | Vale?              |
| -------------------------------------------- | ------------------------ | ------------------ |
| Um jogador nunca consome todo o dinheiro      | 90,0 ≤ 30% de 300,0      | sim (exatamente 30%) |
| … nem com o patrimônio no teto                | 90,0 ≤ 360,0 ÷ 4         | sim                |
| Sempre dá para completar 5 mesmo com o mais caro | 90,0 + 4 × 20,0 = 170,0 ≤ 300,0 | sim       |
| Os 5 mais caros nunca cabem                   | 5 × 90,0 = 450,0 > 360,0 | sim, para sempre   |

Régua `forma → preço` aplicada aos percentis reais (fato 9), `preço = 20,0 + 0,875 × (forma − 20)`:

| Forma (pts/série) | 22,9 (p10) | 37,2 (p25) | 52,1 (p50) | 66,0 (p75) | 80,2 (p90) | ≥ 100 |
| ----------------- | ---------- | ---------- | ---------- | ---------- | ---------- | ----- |
| Preço             | 22,5       | 35,1       | 48,1       | 60,3       | 72,7       | 90,0  |

Cenários de elenco: cinco medianos custam 240,5 (sobram 59,5 de troco); duas estrelas + três
baratos (90 + 90 + 3 × 37) = 291,0 (cabe raspando); cinco estrelas 450,0 (nunca cabe). É esse
"cabe raspando" que é o jogo pedido.

## Fase 0 — A régua: preço e orçamento como domínio puro

Sem banco, sem React — é o que o `CLAUDE.md` exige de `lib/scoring/`.

**Arquivos**

- `lib/scoring/pricing.ts` — reescrito.
- `lib/scoring/form.ts` — novo (média de forma).
- `lib/market/budget.ts` — novo (orçamento e teto).
- `lib/scoring/pricing.test.ts` — reescrito. `lib/scoring/form.test.ts`, `lib/market/budget.test.ts` — novos.

**O que muda**

`lib/scoring/pricing.ts` perde `PRICE_PER_POINT_CENTS`, `MAX_SWING_RATIO` e `averagePoints`
(a média da rodada deixa de existir no motor) e passa a expor:

```ts
export const MIN_PRICE_CENTS = 2_000; // 20,0 cr
export const MAX_PRICE_CENTS = 9_000; // 90,0 cr
export const DEBUT_PRICE_CENTS = 3_000; // 30,0 cr — sem histórico
export const FORM_FLOOR_POINTS = 20; // abaixo disso, preço mínimo (p10 real = 22,9)
export const FORM_CEILING_POINTS = 100; // acima disso, preço máximo (p99 real = 103,7)
export const MAX_STEP_CENTS = 800; // 8,0 cr por rodada
export const APPROACH_RATIO = 0.5; // caminha metade da distância até o alvo

/** Preço justo de uma forma. `null` (sem histórico) = preço de estreia. */
export function targetPriceCents(formPoints: number | null): number;

/** Variação desta rodada, já com passo, amortecimento e faixa aplicados. */
export function priceDeltaCents(args: {
  priceCents: number;
  formPoints: number | null;
  gamesPlayed?: number;
}): number;

/** `priceCents + priceDeltaCents(args)` — a invariante que o CHECK do banco exige. */
export function nextPriceCents(args: {
  priceCents: number;
  formPoints: number | null;
  gamesPlayed?: number;
}): number;
```

Regra de `priceDeltaCents`, na ordem: `alvo = targetPriceCents(forma)` →
`bruto = (alvo − preço) × APPROACH_RATIO × dampingFactor(gamesPlayed)` → arredonda para múltiplo
de 10 centavos (a UI mostra uma casa decimal, `formatCredits`, `lib/market/money.ts:18`) →
limita a ±`MAX_STEP_CENTS` → soma ao preço → prende em `[MIN, MAX]` → devolve
`preçoFinal − preçoAtual`. `dampingFactor` (rampa 0.25/0.5/0.75/1) fica como está.

`lib/scoring/form.ts`:

```ts
/** Quantas séries entram na forma. 5 ≈ um mês e meio de liga. */
export const FORM_WINDOW = 5;

/**
 * Média de pontos das últimas `FORM_WINDOW` séries, da mais recente para a mais
 * antiga. `null` — nunca 0 — para quem não tem série nenhuma: zero é um jogador
 * ruim, ausência é um jogador desconhecido, e os dois têm preço diferente.
 */
export function formPoints(
  seriesPointsDesc: readonly number[],
  window?: number,
): number | null;
```

`lib/market/budget.ts`:

```ts
export const STARTING_BUDGET_CENTS = 30_000; // 300,0 cr
export const MAX_PATRIMONY_CENTS = 36_000; // 360,0 cr

export function patrimonyCents(args: { balanceCents: number; squadValueCents: number }): number;

/** O saldo depois do teto: corta só o caixa, nunca abaixo de zero (Decisão 4). */
export function trimmedBalanceCents(args: {
  balanceCents: number;
  squadValueCents: number;
}): number;

/** Quanto o teto cortou nesta rodada — 0 quando não cortou. */
export function budgetTrimCents(args: { balanceCents: number; squadValueCents: number }): number;
```

`INITIAL_BALANCE_CENTS` sai de `db/schema/fantasy-teams.ts:16` e vira
`STARTING_BUDGET_CENTS` importado de `lib/market/budget.ts` — o schema já importa domínio
assim (`PLAYER_ROLES`, `db/schema/players.ts:17`).

**Testes**

- `pricing`: alvo bate a tabela de percentis da seção anterior; preço nunca sai de `[MIN, MAX]`;
  `nextPriceCents(x) − x === priceDeltaCents(x)` (o CHECK `round_player_score_delta_consistent`
  depende disso); passo nunca passa de 8,0 cr; forma `null` puxa para 30,0 cr; um jogador no
  teto com forma máxima tem delta 0; iterar 30 rodadas converge ao alvo e para.
- `budget`: **teste de guarda das constantes** — as quatro invariantes da tabela acima
  escritas como asserções, para que mexer num número sem mexer no outro quebre o build;
  `trimmedBalanceCents` corta o excedente; elenco maior que o teto zera o caixa e não fica
  negativo.
- `form`: janela de 5, menos de 5 séries usa o que tem, lista vazia devolve `null`.

**Como verificar:** `pnpm test lib/scoring lib/market` e `pnpm exec tsc --noEmit` (vai acusar,
de propósito, os chamadores das Fases 1–6 que ainda usam a API antiga).

## Fase 1 — A forma no banco (migração A, sem CHECK ainda)

**Arquivos**

- `db/schema/players.ts` — nova coluna `formPoints`.
- `db/schema/fantasy-teams.ts` — default do saldo e import de `STARTING_BUDGET_CENTS`.
- `db/schema/round-results.ts` — nova coluna `budgetTrimmedCents` em `round_team_result`.
- `lib/round/queries.ts` — nova `listPlayerFormPoints`.
- `drizzle/` — migração gerada por `pnpm db:generate` (nunca editada à mão).

**O que muda**

1. `player.formPoints`: `numeric("form_points", { precision: 6, scale: 1, mode: "number" })`,
   **nullable** — `null` é "sem série nenhuma", que é o que leva ao preço de estreia.
2. `fantasyTeam.balanceCents`: default passa a `STARTING_BUDGET_CENTS` (300,0 cr). O CHECK
   `fantasy_team_balance_non_negative` continua; o limite superior entra na Fase 4.
3. `roundTeamResult.budgetTrimmedCents`: `integer().notNull().default(0)` — quanto o teto cortou
   naquela virada, para a Home poder explicar o corte em vez de o saldo encolher em silêncio.
4. `listPlayerFormPoints(q)`: uma consulta, todo o catálogo. Subquery com `row_number()` — no
   Postgres a window function roda **depois** do `GROUP BY`, então dá para ranquear séries no
   mesmo passo em que as somamos:

```ts
const ranked = q
  .select({
    playerId: playerMatchStat.playerId,
    points: sql<number>`sum(${playerMatchStat.fantasyPoints})::float8`.as("points"),
    rn: sql<number>`row_number() over (
      partition by ${playerMatchStat.playerId}
      order by max(${match.scheduledAt}) desc
    )`.as("rn"),
  })
  .from(playerMatchStat)
  .innerJoin(match, eq(match.id, playerMatchStat.matchId))
  .groupBy(playerMatchStat.playerId, playerMatchStat.matchId)
  .as("ranked");

// depois: select avg(points) ... from ranked where rn <= FORM_WINDOW group by playerId
```

Drizzle puro, sem SQL cru solto (o `sql` template dentro do builder é o padrão já usado em
`listLiveRoundScores`, `lib/round/queries.ts:271`). Devolve `Map<string, number>`.

Esta fase **não** mexe em `refreshPlayerAggregates`: a reescrita dela inteira é a Fase 2 — a
mesma mudança descrita em duas fases seria a receita para implementá-la pela metade.

**Testes**

`lib/round/queries` não é testada com banco (regra do `CLAUDE.md`: banco mockado); o teste da
regra vive em `lib/scoring/form.test.ts`, sobre a função pura. Para `listPlayerFormPoints`, teste
de contrato com o querier mockado (a query é montada e o `Map` é construído a partir das linhas).

**Como verificar:** `pnpm db:generate` produz uma migração só com `ALTER TABLE ... ADD COLUMN` e
mudança de default; `pnpm test`; `pnpm exec tsc --noEmit`.

## Fase 2 — Revisão do backfill inteiro

A Fase 1 deixa a coluna e a consulta prontas, mas o `case when` de `refreshPlayerAggregates` é o
sintoma: a causa é que **ninguém chama essa função fora da carga histórica** (fato 12). Sem esta
fase, "preço derivado da forma" seria verdade no dia do backfill e mentira no dia seguinte. Aqui
isso vira invariante do pipeline, não efeito colateral de um comando manual.

**Arquivos**

- `lib/vlr/jobs/calculate-round.ts` — `refreshPlayerAggregates` quebrada em duas.
- `lib/vlr/jobs/work.ts` — `workQueue`.
- `scripts/vlr/reprocess.ts`.
- `lib/vlr/persist/players.ts` — nascimento do jogador.
- `lib/vlr/jobs/backfill.ts` — chamadores e log.
- `db/schema/players.ts` + `drizzle/` — `average_score` sai.
- Testes: `lib/vlr/jobs/calculate-round.test.ts`, `lib/vlr/jobs/work.test.ts`,
  `lib/vlr/persist/players.test.ts`, `db/close-round.test.ts`.

**O que muda**

1. **`refreshPlayerAggregates` vira duas funções, e a separação é a decisão importante:**
   - `refreshPlayerForm(tx)` — grava `form_points` e `games_played` de todo o catálogo.
     **Nunca toca em preço.**
   - `rebasePlayerPrices(tx)` — `price_cents = targetPriceCents(form_points)` para todos, sem
     passo.

   Por que separadas: **o preço não pode andar no meio de uma rodada aberta.** O usuário compra e
   vende durante a janela de mercado (`evaluateSubstitution`, `lib/market/eligibility.ts:104`);
   se o preço mudasse a cada partida raspada, o mesmo jogador custaria diferente de manhã e à
   noite, e o "cabe raspando" da Decisão 1 viraria loteria. Preço só se move no fechamento da
   rodada (Fase 5) ou num rebase explícito, que é operação de manutenção.

2. **Quem chama o quê:**
   - `refreshPlayerForm` ao fim de `workQueue` (`lib/vlr/jobs/work.ts:65`), **uma vez por lote**
     quando `done > 0` — nunca uma vez por partida: a função varre o catálogo inteiro e chamá-la
     por partida faria N vezes o mesmo trabalho. `workQueue` é o consumidor único dos três
     handlers (`work.ts:13-17`), então isso cobre o cron e o caminho normal de uma vez.
   - `refreshPlayerForm` também em `scripts/vlr/reprocess.ts:19`, depois de `reprocessMatch` —
     esse script chama a função direto, fora da fila (fato 15). Sem isso, corrigir uma regra de
     scout deixa a forma com a regra velha.
   - `rebasePlayerPrices` só em `backfill()` e no `pnpm db:reprice` da Fase 3.

3. **`games_played` ganha um dono só** (fato 14). `refreshPlayerForm` passa a ser esse dono:
   conta rodadas distintas (`count(distinct match.round_id)`), caindo para partidas distintas só
   quando a partida ainda não pertence a rodada nenhuma — o caso do backfill, que roda antes de
   `syncRoundsFromMatches` ter o que agrupar, e que o comentário de `calculate-round.ts:123-124`
   já descreve. `closeActiveRound` (`db/close-round.ts:141`) **para de incrementar**: passa a
   chamar `refreshPlayerForm(tx)` antes da reprecificação, e o número sai certo por construção em
   vez de por soma.

4. **`average_score` sai do schema** (fato 13) — `form_points` assume o papel. É o único passo
   destrutivo do plano; a migração `DROP COLUMN` vai junto com a da Fase 4, para não gerar duas
   migrações destrutivas separadas. Se preferir adiar, deixar a coluna parada não quebra nada —
   só continua morta.

5. **`createPlayer` nasce em `DEBUT_PRICE_CENTS`** (`lib/vlr/persist/players.ts:166`, hoje
   `MIN_PRICE_CENTS`), e o comentário das linhas 164-165 passa a descrever o que de fato
   acontece: o preço de estreia vale até existir forma, e o `refreshPlayerForm` do fim do lote já
   produz essa forma — sem depender de alguém rodar `pnpm vlr:backfill` (fato 16).

6. **Fim dos N updates por chamada.** `refreshPlayerAggregates` hoje faz um `UPDATE` por jogador
   dentro de um laço (`calculate-round.ts:136-144`) — 596 idas ao banco. Como agora ela roda a
   cada lote da fila, e não uma vez por carga histórica, `refreshPlayerForm` passa a um único
   `UPDATE ... FROM (values ...)` montado pelo builder do Drizzle. Os laços de `calculateRound`
   (`calculate-round.ts:41-48`) e `closeActiveRound` (`db/close-round.ts:132-144`) ficam como
   estão: rodam uma vez por rodada, não por lote.

**Testes** (banco mockado, como já é hoje)

- `calculate-round.test.ts`: `refreshPlayerForm` grava forma e **não** altera preço;
  `rebasePlayerPrices` leva todo mundo ao alvo, inclusive quem está **acima** do piso (o caso que
  o `case when` deixava passar); `games_played` conta rodadas distintas e cai para partidas só
  quando `round_id` é nulo.
- `work.test.ts`: lote com `done > 0` chama `refreshPlayerForm` exatamente **uma** vez; lote com
  `done === 0` não chama.
- `persist/players.test.ts:8`: jogador novo nasce em `DEBUT_PRICE_CENTS`.
- `close-round.test.ts`: `gamesPlayed` não é mais incrementado no laço e sai correto depois de
  `refreshPlayerForm`.

**Como verificar:** `pnpm test lib/vlr db/close-round.test.ts` · rodar `pnpm vlr:work` num lote e
conferir que `form_points` preencheu e `price_cents` **não** mudou · rodar
`pnpm vlr:reprocess --match=<vlrId>` e conferir que a forma acompanhou a estatística nova.

## Fase 3 — Rebase: repreçar o catálogo e recalcular os saldos

**Atenção: esta é a primeira fase que altera dados de produção** — preço de todo o catálogo e
saldo de todos os times. Faça backup do banco (`pg_dump`) antes de rodar o script, e rode-o
primeiro no ambiente de desenvolvimento.

**Arquivos**

- `scripts/db/reprice.ts` — novo.
- `package.json` — script `"db:reprice": "tsx scripts/db/reprice.ts"`.
- `db/seed.ts` — os 15 preços à mão (linhas 60–284) reescritos para a faixa 20,0–90,0.

**O que muda**

`scripts/db/reprice.ts`, tudo dentro de **uma** `db.transaction` (exigência do `CLAUDE.md`: toda
alteração de saldo é transacional):

1. `refreshPlayerForm(tx)` (Fase 2) → `player.formPoints` e `games_played` de todo o catálogo.
2. `rebasePlayerPrices(tx)` → `player.priceCents = targetPriceCents(formPoints)` para **todos** —
   rebase direto no alvo, sem passo: é um recomeço de escala, não uma rodada. Quem não tem forma
   vai para `DEBUT_PRICE_CENTS`.
3. Para cada `fantasy_team`: `squadValue` = soma dos preços novos dos jogadores das 5 vagas;
   `balanceCents = clamp(STARTING_BUDGET_CENTS − squadValue, 0, MAX_PATRIMONY_CENTS)`.
   Ninguém perde jogador (Decisão 9) e ninguém fica negativo.
4. Log final em pt-BR: quantos jogadores repreçados, faixa resultante, quantos times tiveram
   saldo zerado.

O script é **idempotente**: rodar duas vezes dá o mesmo resultado (o alvo não depende do preço
anterior).

**Testes**

Script de operação, sem teste de unidade próprio — a lógica que ele usa (`targetPriceCents`,
`trimmedBalanceCents`, `rebasePlayerPrices`) já está coberta nas Fases 0 e 2. O que se testa aqui
é o seed: `pnpm db:seed` seguido de conferência de que nenhum preço semeado sai da faixa.

**Como verificar:** `pnpm db:reprice` e depois, no `pnpm db:studio` (ou numa consulta de leitura),
confirmar: `min(price_cents) >= 2000`, `max(price_cents) <= 9000`, nenhum
`balance_cents + squad_value > 36000`, nenhum time com saldo negativo.

## Fase 4 — Migração B: os CHECKs da faixa

Separada da Fase 1 **de propósito**: um `CHECK price_cents BETWEEN 2000 AND 9000` aplicado antes
do rebase falharia na hora, porque existe gente a 523,4 cr no banco (fato 3). O Postgres valida a
tabela inteira ao criar a constraint.

**Arquivos:** `db/schema/players.ts`, `db/schema/fantasy-teams.ts`, `drizzle/` (migração gerada).

**O que muda**

- `player`: troca `player_price_cents_positive` (`db/schema/players.ts:145`) por
  `player_price_cents_range` — `price_cents BETWEEN MIN_PRICE_CENTS AND MAX_PRICE_CENTS`.
- `fantasy_team`: `fantasy_team_balance_non_negative` vira
  `fantasy_team_balance_range` — `balance_cents BETWEEN 0 AND MAX_PATRIMONY_CENTS`. É condição
  necessária (não suficiente: o teto real é sobre saldo + elenco, que nenhum CHECK de uma tabela
  só alcança) — e é justamente a rede que impede um bug de crédito de inflar o caixa.
- `DROP COLUMN average_score` (item 4 da Fase 2) vai nesta mesma migração — a única destrutiva
  do plano.

**Como verificar:** `pnpm db:generate` + `pnpm db:migrate` rodam sem erro **porque** a Fase 3 já
passou. Se falhar, é sinal de que o rebase não cobriu alguém — não é para "afrouxar o CHECK".

## Fase 5 — Fechamento de rodada com o motor novo e o teto

**Arquivos**

- `db/close-round.ts` — a virada.
- `db/close-round.test.ts` — atualizado.

**O que muda**

Dentro da transação que já existe (`closeActiveRound`, `db/close-round.ts:33`), em ordem:

1. Sai o cálculo de `averagePoints` (`close-round.ts:49`) — o motor novo não usa média de rodada;
   com ela some também a "inflação sistêmica" que o comentário das linhas 46–48 descreve.
2. Entra `refreshPlayerForm(tx)` (Fase 2) **antes** de qualquer reprecificação: é ela que grava
   `form_points` e `games_played` do catálogo. Com isso, o `gamesPlayed: row.score !== 0 ? +1 : …`
   de `close-round.ts:141` **sai** — o contador passa a ter um dono só, e sai certo por
   construção em vez de por soma (fato 14).
3. `nextPriceById` passa a usar `nextPriceCents({ priceCents, formPoints, gamesPlayed })`, e só
   para quem pontuou na rodada (`row.score !== 0`, Decisão 7); para os demais,
   `priceAfter = priceBefore` e o snapshot grava delta 0.
4. Depois de gravar `round_roster` e `round_team_result` com os preços **de antes** (o valor do
   elenco durante a rodada — comportamento atual, mantido), recomputar o valor do elenco com os
   preços **novos** e aplicar o teto:

```ts
const squadAfterCents = team.slots.reduce(
  (total, slot) => total + (slot.playerId ? nextPriceById.get(slot.playerId)! : 0),
  0,
);
const trimmedCents = budgetTrimCents({ balanceCents: team.balanceCents, squadValueCents: squadAfterCents });
// grava `budgetTrimmedCents: trimmedCents` no snapshot e
// `balanceCents: trimmedBalanceCents(...)` em `fantasy_team`.
```

O corte entra no `UPDATE fantasy_team` da mesma transação — nunca num update solto (`CLAUDE.md`).

**Testes** (`db/close-round.test.ts`, banco mockado, como já é hoje)

- Um jogador com forma alta sobe no máximo 8,0 cr; um com forma baixa desce no máximo 8,0 cr.
- Jogador que não pontuou fica com preço idêntico e delta 0.
- Preço prende em 90,0 e em 20,0.
- `gamesPlayed` vem de `refreshPlayerForm`, não de incremento.
- Time cujo patrimônio passa de 360,0 tem o caixa cortado, `budgetTrimmedCents` gravado, e o
  elenco intacto.
- Time com elenco valendo mais que o teto fica com saldo 0 e nenhum jogador vendido.

**Como verificar:** `pnpm test db/close-round.test.ts`.

## Fase 6 — Telas: o orçamento visível e a tendência do preço

`frontend-design` na mão, identidade dark Valorant, zero cor hard-coded (só variáveis de
`app/globals.css`), shadcn antes de componente novo.

**Arquivos**

- `components/ui/progress.tsx` — instalar (`pnpm dlx shadcn@latest add progress`); não existe hoje
  em `components/ui/`.
- `components/team/budget-bar.tsx` + `.test.tsx` — novo.
- `app/(app)/my-team/page.tsx` e `lib/team/types.ts` (`TeamSummary`) / `lib/team/queries.ts` —
  o resumo passa a carregar `squadValueCents`.
- `lib/team/types.ts` (`Player`) e `lib/team/mappers.ts` — `formPoints: number | null` viaja com o
  jogador.
- `components/market/market-player-row.tsx` + teste — tendência de preço.
- `lib/home/summary.ts`, `lib/round/types.ts`, `lib/round/queries.ts` — projeção da rodada aberta.

**O que muda**

1. **`BudgetBar`** em "Meu Time", acima do `FormationBoard`: três números — Saldo, Valor do elenco,
   Patrimônio `X / 360,0` — e a barra de progresso do patrimônio contra o teto. Quando o teto
   cortou na última virada, uma linha discreta: `"Seu teto de 360,0 cr cortou 12,5 cr nesta
   rodada."` Toda formatação por `formatCredits`/`PlayerPrice` — nenhum componente formata moeda
   na mão (`lib/market/money.ts`).
2. **`MarketPlayerRow`**: ao lado do preço, a seta de tendência derivada de
   `targetPriceCents(candidate.formPoints)` comparado ao preço atual — "▲ valorizando" /
   "▼ desvalorizando" / "estável", com `aria-label` em pt-BR. É o que transforma "comprar quem
   está em baixa" numa decisão informada em vez de um palpite.
3. **Home**: `projectRoundHighlights` (`lib/home/summary.ts:90`) não usa mais `averagePoints` +
   delta contra a média; passa a projetar com a **forma incluindo as séries já jogadas da rodada
   corrente**. `LiveRoundScore` (`lib/round/types.ts:51`) ganha `formPoints: number | null`, e
   `listLiveRoundScores` (`lib/round/queries.ts:271`) passa a selecionar `player.formPoints`.
   O rótulo "parcial" da tela continua valendo.
4. O header (`components/layout/app-header.tsx:47`) continua mostrando **só o saldo** — o teto é
   informação de "Meu Time", não de toda tela; `MarketSummaryBar` continua com Saldo / Pode
   gastar / Região, sem mudança estrutural.

**Testes** (React Testing Library, queries por role/label/text)

- `budget-bar.test.tsx`: mostra os três valores; a barra tem `role="progressbar"` com
  `aria-valuenow`/`aria-valuemax` certos; a frase do corte só aparece quando houve corte.
- `market-player-row.test.tsx`: um candidato cujo alvo é maior que o preço anuncia valorização;
  o bloqueio "Sem saldo" continua aparecendo quando o preço passa do teto de compra.
- `market-summary-bar.test.tsx` e `formation-board.test.tsx`: atualizar os números fixos para a
  escala nova.

**Como verificar:** `pnpm test`, `pnpm lint`, `pnpm build`, e na tela: abrir `/my-team`, conferir
que Saldo + Valor do elenco = Patrimônio e que a barra chega no máximo ao teto.

## Fase 7 — Fechamento

- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.
- Conferir que nenhum arquivo importa mais `PRICE_PER_POINT_CENTS` ou `MAX_SWING_RATIO`
  (hoje: `lib/vlr/jobs/calculate-round.ts:5`, `lib/home/summary.ts:19`, `db/close-round.ts:16`,
  `lib/vlr/persist/players.ts:5`).
- Conferir que `refreshPlayerAggregates` não existe mais em lugar nenhum — só
  `refreshPlayerForm` e `rebasePlayerPrices`, com os chamadores da Fase 2.

## Riscos e o que fica de fora

- **A régua depende do scout.** `FORM_FLOOR_POINTS`/`FORM_CEILING_POINTS` foram calibrados sobre
  a distribuição atual de `fantasy_points` (`SCOUT_RULES`, `lib/scoring/scout.ts:44`). Mexer nas
  regras de pontuação sem recalibrar a régua desloca a faixa inteira — deixar isso escrito no
  comentário de `pricing.ts`, ao lado de `SCOUT_VERSION`.
- **`refreshPlayerForm` passa a rodar a cada lote da fila**, varrendo o catálogo inteiro. Com 596
  jogadores é barato, e o `UPDATE` único do item 6 da Fase 2 é o que mantém isso barato — mas é o
  ponto a vigiar se o catálogo crescer muito (aí a saída é recalcular só os jogadores das partidas
  do lote, não o catálogo todo).
- **Descontinuidade no histórico.** O patrimônio da Home compara rodadas
  (`patrimonyDeltaCents`, `lib/home/summary.ts:35`); a primeira rodada fechada depois do rebase
  vai comparar escalas diferentes e mostrar um salto artificial. Os snapshots antigos não são
  reescritos (Decisão 9); se o salto incomodar, a saída é a Home ignorar o delta que cruza o
  rebase — **não** está neste plano.
- **Quem não joga fica caro para sempre** (Decisão 7): um jogador que despencou e sumiu do
  circuito congela no preço. Quando voltar, a forma das últimas 5 séries já o corrige, mas até lá
  ele é uma armadilha no mercado. Aceito de propósito — a alternativa (preço andando sozinho sem
  jogo) contradiz "o preço muda pelos stats".
- **Os 15 jogadores do seed** (fato 5) continuam no catálogo, agora dentro da faixa. Limpá-los é
  outro trabalho.
- **Fora de escopo, deliberadamente:** regra de "máximo N estrelas" (Decisão 10); mudança
  qualquer no ranking (fato 8); histórico de preço por jogador na tela do jogador
  (`round_player_score` já guarda o dado, mas nenhuma tela nova o exibe aqui); e preço diferente
  por região.

---

**Revisto pelo plano 26** (`.claude/plans/26-regras-de-preco-e-saldo.md`): teto de patrimônio
removido, motor de preço trocado.
