# Pipeline de dados do vlr.gg

Como o jogo deixa de ser fictício: raspar o vlr.gg, guardar as estatísticas
reais de cada partida e pontuar as escalações com elas.

## Princípio norteador

**O HTML bruto é o dado; tudo depois dele é recomputável.**

```
fetch (1 req/s, UA identificável)  →  arquivo .html.gz  →  parser puro (fixture)
   →  Zod  →  normalizador puro  →  upsert idempotente  →  scout puro  →  player.score
   →  closeActiveRound (já existia)
```

Uma requisição por partida grava o arquivo **antes** de qualquer parse, e a
mesma partida nunca é buscada duas vezes (`match.scraped_at`). Parser, pontuação
e preço são funções puras rodando sobre esse arquivo: um seletor que quebrou,
uma regra de scout que mudou ou um bug de fuso se corrigem **reprocessando o
disco** (`pnpm vlr:reprocess`), sem uma requisição nova e sem perder histórico.

Nenhuma camada pula a anterior. O scraper não conhece o banco; o normalizador
não conhece HTTP; o motor de pontuação não conhece nem um nem outro.

## Regras de convivência com o vlr.gg

1. **Uma requisição a cada ~1,1s**, para o processo inteiro
   (`lib/vlr/http/rate-limiter.ts`, singleton de módulo).
2. **User-Agent identificável, nunca falsificando navegador**:
   `VlrFantasy/1.0 (+<VLR_CONTACT_EMAIL>)`.
3. **Um único portão de saída**: só `lib/vlr/http/client.ts` chama `fetch`.
   Nenhum outro módulo faz rede — é o que garante que o rate limit não tem por
   onde escapar, retentativas inclusive.
4. **Cache permanente**: partida com `scraped_at` preenchido nunca é
   reenfileirada. Na prática, é uma cláusula `WHERE`
   (`lib/vlr/jobs/sync-results.ts`).

## Comandos

| Comando              | Cron sugerido | O que faz                                                        |
| -------------------- | ------------- | ---------------------------------------------------------------- |
| `pnpm vlr:events`    | semanal       | `/events` → `vlr_event`. **Não** mexe em `tracked`               |
| `pnpm vlr:schedule`  | 06:00         | `/matches` → calendário → rodadas semanais (`marketClosesAt`)    |
| `pnpm vlr:results`   | \*/15min      | `/matches/results` → marca encerradas e enfileira a extração     |
| `pnpm vlr:work`      | \*/5min       | Consome a fila; falha isolada não derruba o lote                 |
| `pnpm vlr:round`     | \*/30min      | Rodada toda extraída → `calculateRound` + `closeActiveRound`     |
| `pnpm vlr:doctor`    | diário        | Roda os parsers contra a rede; exit ≠ 0 se algum seletor quebrou |
| `pnpm vlr:backfill`  | manual        | Carga histórica (`--pages=20`)                                   |
| `pnpm vlr:reprocess` | manual        | `--match=<vlrId>` — reparsa do HTML salvo, **sem rede**          |

Sem processo de longa duração: a fila vive no próprio Postgres (`vlr_job_run`,
com `FOR UPDATE SKIP LOCKED`) e os scripts saem quando terminam.

## Primeira execução

```bash
pnpm vlr:events                       # popula vlr_event
pnpm db:studio                        # marque `tracked` nos campeonatos do fantasy
pnpm vlr:schedule                     # calendário + rodadas semanais
pnpm vlr:backfill --pages=5           # carga histórica (rode de novo: as contagens têm de bater)
```

Jogadores novos nascem com **`needs_review = true` e `active = false`**: ficam
fora do mercado até alguém conferir a função inferida do agente. É deliberado —
nunca duplicamos nem publicamos jogador em silêncio. Para liberar, revise em
`pnpm db:studio` e marque `active`.

## A trava de escalação (regra inviolável nº 8)

`syncRoundsFromMatches` (`lib/vlr/persist/rounds.ts`) coloca em
`round.market_closes_at` o **kickoff do primeiro jogo da semana**. Daí em
diante nada de novo acontece: `isMarketOpen` (`lib/market/window.ts`) e
`evaluateSubstitution` já bloqueavam por `market-closed` — só faltava o dado
certo naquela coluna. Nenhuma linha de UI mudou.

## A estrutura real do vlr.gg (verificada em 03/09/2026)

Todo seletor vive em `lib/vlr/scrapers/selectors.ts`. **Nenhuma string de
seletor em qualquer outro arquivo** — é o que transforma "o vlr mudou o
layout" num diff de um arquivo só.

### Scoreboard da partida — `/{vlrId}/?game=all&tab=overview`

Não existe uma única tag `<table>` na página. A estrutura é
`div.ovw-table` › `div.ovw-row` › `div.ovw-cell[data-col]`, e **uma
requisição traz a série inteira**: o agregado (`data-game-id="all"`) e um
`div.vm-stats-game[data-game-id]` numérico por mapa.

Guardamos **só as linhas por mapa**. O agregado é uma `SUM` sobre elas; tê-lo
no banco convidaria a somar duas vezes.

| Campo        | Origem                                                                       |
| ------------ | ---------------------------------------------------------------------------- |
| vlrId, slug  | `.ovw-cell.mod-player .ovw-player a[href]` → `/player/49871/yuno`            |
| nickname     | `.ovw-player-name`                                                           |
| sigla        | `.ovw-player-tag` ("FLY")                                                    |
| país         | `.ovw-player i.flag[title]`                                                  |
| agente       | `.ovw-agents img[title]` — vários no agregado, **um por mapa**               |
| estatísticas | `.ovw-cell[data-col=…] span.side.mod-both`                                   |
| K/D/A        | `.ovw-cell.mod-kda .ovw-kda-stat[data-col=kills\|deaths\|assists] .mod-both` |

`data-col`: `rating2`, `acs`, `kast`, `adr`, `hsp`, `fb`, `fd`.

## As três armadilhas, todas silenciosas

### 1. `data-utc-ts` **não é UTC**

A partida 724899 traz `data-utc-ts="2026-09-02 17:00:00"` e imprime
"5:00 PM EDT" ao lado: os dois são o **mesmo horário em America/New_York**.
Ler o atributo como UTC desloca toda partida em 4–5h — e, com ela, o
`market_closes_at` da rodada, quebrando a trava de escalação.

A conversão mora em uma função só, com um teste que a trava:
`parseVlrTimestamp` (`lib/vlr/normalize/kickoff.ts`).

### 2. A ordem dos spans `.mod-both`/`.mod-t`/`.mod-ct` **varia por coluna**

Na mesma página, `acs` vem `(both, t, ct)` e algumas linhas de `rating2` vêm
`(t, ct, both)`. Pegar "o primeiro span" produz um número plausível e errado,
sem erro nenhum. **Sempre `span.side.mod-both` explícito** (`SIDE_BOTH`).

### 3. `.mod-dash` no placar da lista **não** significa "não jogou"

Em `/matches/results` ela marca a máscara de spoiler e convive com um placar
real. O marcador correto de partida por vir é
`.match-item-vs-team-score.mod-upcoming`.

## Consertar um seletor

1. `pnpm vlr:doctor` — diz **qual** parser parou de casar e em qual página.
2. Baixe a página nova por cima da fixture correspondente
   (`lib/vlr/fixtures/`), sem editar o HTML à mão.
3. Ajuste **só** `lib/vlr/scrapers/selectors.ts` e rode `pnpm test`: as
   fixtures provam que o parser entende o HTML de ontem, o doctor prova que
   entende o de hoje.
4. `pnpm vlr:reprocess --match=<vlrId>` para cada partida afetada — reparsa do
   disco, **sem rede**. Depois `pnpm vlr:round` recalcula a pontuação.

## Observabilidade

Todo request e todo job emitem uma linha JSON em stdout (`lib/vlr/http/log.ts`)
com `event`, `durationMs` e o desfecho. As métricas de fila saem por SQL:

```sql
-- taxa de sucesso e tentativas por job
select job, status, count(*), avg(attempts)
from vlr_job_run group by job, status;

-- a dead letter queue: o que desistiu e por quê
select key, attempts, last_error from vlr_job_run where status = 'dead';

-- jogadores esperando revisão
select count(*) from player where needs_review;
```
