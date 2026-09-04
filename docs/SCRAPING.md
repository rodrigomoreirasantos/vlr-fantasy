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
| `pnpm vlr:results`   | \*/5min       | `/matches/results` → marca encerradas e enfileira a extração     |
| `pnpm vlr:work`      | \*/2min       | Consome a fila; falha isolada não derruba o lote                 |
| `pnpm vlr:round`     | \*/15min      | Rodada toda extraída → `calculateRound` + `closeActiveRound`     |
| `pnpm vlr:doctor`    | diário        | Roda os parsers contra a rede; exit ≠ 0 se algum seletor quebrou |
| `pnpm vlr:backfill`  | manual        | Carga histórica (`--pages=20`)                                   |
| `pnpm vlr:reprocess` | manual        | `--match=<vlrId>` — reparsa do HTML salvo, **sem rede**          |

Mais uma linha, essa só uma vez por dia:

```bash
pnpm vlr:results --force --pages=3    # varre o que ficou fora da janela
```

Sem processo de longa duração: a fila vive no próprio Postgres (`vlr_job_run`,
com `FOR UPDATE SKIP LOCKED`) e os scripts saem quando terminam.

## Ritmo em dia de jogo

O cron é fixo; o que muda é o que cada execução **faz**. Só `vlr:results` vai à
rede toda vez que roda — e, num dia sem partida, vai à rede para reler a mesma
página. Por isso ele passa por um portão (`lib/vlr/jobs/cadence.ts`):

> Existe partida de campeonato seguido que já começou (ou começa em 15 min) e
> que o vlr ainda não fechou?

É exatamente o conjunto que `/matches/results` resolveria. Zero significa que a
página não tem nada de novo a dizer, e o job sai sem gastar requisição —
custando uma consulta ao banco.

Com isso o cron pôde apertar sem aumentar em nada o tráfego que o vlr.gg recebe
fora de dia de jogo: **em dia de jogo**, um resultado vira pontuação em ~7 min
(`results` a cada 5, `work` a cada 2); **fora dele**, o pipeline inteiro não faz
uma única requisição.

A cauda da janela é de 12h e é proposital: uma Bo5 cabe folgada, e o que passa
disso não é jogo demorado, é partida que o vlr nunca fechou (cancelada, W.O.).
Sem esse limite, uma dessas custaria uma requisição por ciclo para sempre. Quem
varre esses restos é a passada diária com `--force`.

`vlr:work` e `vlr:round` não precisam de portão: sem fila e sem rodada
completa, os dois saem depois de uma consulta, sem tocar na rede.

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
`round.market_closes_at` **uma hora antes do kickoff do primeiro jogo da
semana** (`marketClosesAtFor`, `lib/market/window.ts`). A hora de antecedência
é a regra, não um arredondamento: escalar com o jogo prestes a começar é
escalar já sabendo de escalação divulgada e time em quadra — vira conferência,
não aposta. Daí em diante nada de novo acontece: `isMarketOpen` e
`evaluateSubstitution` já bloqueavam por `market-closed` — só faltava o dado
certo naquela coluna.

### Na tela: o fechamento do dia, por campeonato

A Home tem **um** painel de partidas, "Próximos jogos" (`<MatchSchedule>`):
cada linha traz o kickoff à esquerda e o fechamento do mercado à direita, e o
countdown do topo segue o filtro de campeonato. A regra que ele aplica é
`marketClosesByMatch` (`lib/market/window.ts`):

> O mercado de um campeonato fecha **uma hora antes do primeiro jogo daquele
> campeonato naquele dia.**

Por isso jogos do mesmo campeonato no mesmo dia repetem o horário — o mercado
fecha uma vez por dia, não a cada partida — e um dia de Pacific de madrugada
não tranca quem só tem jogador de Americas.

A lista vem de `listUpcomingMatches` — o scrap, e só ele. Ler as partidas
ligadas à rodada ativa era o que fazia o painel anunciar um fechamento
inexistente: com uma rodada de seed ativa (sem `event_id` nas partidas), ele
mostrava a janela dela — dias à frente — enquanto o próximo jogo de verdade era
no dia seguinte.

> **Divergência conhecida.** `evaluateSubstitution` ainda tranca pela coluna
> `round.market_closes_at`, que é semanal: fecha no primeiro jogo da semana e
> não reabre. A tela já segue a regra do dia; alinhar a trava exige decidir se
> o mercado reabre entre um dia de jogo e o seguinte.

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
