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

Desde o plano 17 ("scrap automático — sem comando, sempre em dia"), **nenhuma
destas linhas precisa ser digitada por alguém**: todas rodam sozinhas pelo
cron de `deploy/vlr-cron/` (Docker ou crontab de sistema). O comando continua
existindo para rodar manualmente quando algo precisa ser forçado.

| Comando                      | Cron                                       | O que faz                                                                                                                                                               |
| ---------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm vlr:events`            | diário 03:00                               | `/events` → `vlr_event`, e liga `tracked` sozinho para o circuito principal (VCT das 4 ligas, Masters, Champions). O veto humano (`tracked_override`) continua mandando |
| `pnpm vlr:rosters`           | diário 05:00                               | Elenco de cada organização relevante → `player.team`/`nickname`/`realName`/`país` — transferência aparece sem esperar o jogador entrar em quadra                        |
| `pnpm vlr:regions`           | diário 05:30                               | Idempotente, sem rede — reclassifica a região de quem mudou de organização                                                                                              |
| `pnpm vlr:activate-reviewed` | diário 05:40                               | Libera no mercado quem ficou `needsReview` mas tem identidade confiável — rede de segurança, idempotente, nunca afrouxa o critério                                      |
| `pnpm vlr:schedule`          | 6 em 6h                                    | `/matches`, paginado até o fim → calendário → rodadas semanais (`marketClosesAt`) → marca partida cancelada como sumida                                                 |
| `pnpm vlr:results`           | 1 em 1 min                                 | `/matches/results` → marca encerradas e enfileira a extração. Passa pelo portão de cadência: fora de janela de partida, só consulta o banco                             |
| `pnpm vlr:revalidate`        | de hora em hora                            | Enfileira a releitura tardia de partida extraída entre 6h e 48h atrás — a correção que o vlr faz depois de fechar o jogo                                                |
| `pnpm vlr:work`              | 1 em 1 min                                 | Consome a fila (partida, releitura, elenco); falha isolada não derruba o lote                                                                                           |
| `pnpm vlr:round`             | 5 em 5 min                                 | Rodada toda extraída (e não descartada) → `calculateRound` + `closeActiveRound`                                                                                         |
| `pnpm vlr:doctor`            | diário 07:00                               | Roda os parsers contra a rede e confere o batimento dos jobs; exit ≠ 0 se um seletor quebrou **ou** algum job está atrasado                                             |
| `pnpm vlr:health`            | a cada 5 min, pelo `healthcheck` do Docker | **Sem rede** — lê o batimento (`vlr_job_health`) e falha se algo parou                                                                                                  |
| `pnpm vlr:backfill`          | manual                                     | Carga histórica (`--pages=20`)                                                                                                                                          |
| `pnpm vlr:reprocess`         | manual                                     | `--match=<vlrId>` — reparsa do HTML salvo, **sem rede** (não traz correção do vlr — ver "Por que não existe gatilho")                                                   |

Mais uma linha, essa só uma vez por dia:

```bash
pnpm vlr:results --force --pages=3    # varre o que ficou fora da janela
```

Sem processo de longa duração: a fila vive no próprio Postgres (`vlr_job_run`,
com `FOR UPDATE SKIP LOCKED`) e os scripts saem quando terminam.

## Por que não existe gatilho

O plano 17 pedia que o scrap disparasse "assim que algo mudar no site". Não
dá — verificado, não hipotético. O vlr.gg é site de terceiro: não publica
webhook, não tem push, e a única alternativa barata do HTTP (`ETag`/
`Last-Modified`, o "me diga só se mudou") também não existe:

```
$ curl -sI https://www.vlr.gg/matches
HTTP/2 200
cache-control: no-store, no-cache, must-revalidate
pragma: no-cache
```

Sem `ETag`. Sem `Last-Modified`. `no-store` explícito — o servidor desliga
cache de propósito. A única forma de saber que algo mudou é **baixar a
página e comparar**. O que este pipeline faz no lugar do gatilho:

- **Pergunta rápido só quando importa.** `vlr:results`/`vlr:work` de minuto em
  minuto, mas só vão à rede de fato durante a janela de partida
  (`lib/vlr/jobs/cadence.ts`) — fora dela, cada execução é uma consulta ao
  banco, nunca uma requisição.
- **Impressão digital, não byte a byte.** `fingerprint` (`lib/vlr/http/
fingerprint.ts`) é o SHA-256 do **payload já interpretado**, não do HTML
  bruto — a página carrega carimbo relativo ("2d ago") e cookie de sessão que
  mudariam o hash mesmo quando nada relevante mudou. Página idêntica
  (`lib/vlr/persist/page-state.ts`) pula upsert e paginação seguinte; partida
  idêntica (`match.content_hash`) pula a releitura tardia. A requisição, essa,
  já aconteceu — o que se evita é o processamento depois dela.
- **Uma releitura tardia por partida.** `pnpm vlr:reprocess` reparsa o **HTML
  salvo em disco** — se o vlr corrigir uma estatística depois de fechar o
  jogo, reprocessar o mesmo arquivo devolve o mesmo dado velho.
  `pnpm vlr:revalidate` é o que de fato busca de novo: uma vez, 6 a 48h depois
  da extração original.

### Onde o cron roda

**Fora do serverless, sempre.** `deploy/vlr-cron/` tem o agendador pronto
(Docker + crontab, ou crontab de sistema puro para quem não usa Docker) —
`deploy/vlr-cron/README.md` tem o passo a passo. Duas razões, as duas
verificadas neste projeto, não hipotéticas:

1. **O disco importa.** `VLR_STORAGE_DIR` (`lib/vlr/http/raw-store.ts`) é o
   HTML bruto — "o dado é o HTML, tudo depois é recomputável", o princípio
   norteador deste documento. Um disco efêmero (o de toda função serverless,
   Vercel incluída) apaga isso a cada execução, e `pnpm vlr:reprocess` para
   de servir para algo.
2. **O tempo importa.** `vlr:work` processa até 10 partidas por chamada, a
   ~1,1s de rate limit cada — ≥11s, acima do teto de 10s de uma função
   Hobby da Vercel. E mesmo num plano que aceitasse a duração, o ritmo
   `*/5min`/`*/2min` da tabela acima é mais apertado do que um cron de
   plataforma serverless costuma oferecer fora do plano pago.

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
fora de dia de jogo: **em dia de jogo**, um resultado vira pontuação em ~1 a
3 min (`results` e `work`, os dois a cada minuto); **fora dele**, o pipeline
inteiro não faz uma única requisição — só uma consulta ao banco por ciclo.

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

Jogador novo nasce **`active = true`** direto quando a identidade é confiável:
vlrId do scoreboard, agente reconhecido (função não caiu no fallback) e sem
colisão de nickname. Só quem não bate um desses três nasce com
**`needs_review = true` e `active = false`**, fora do mercado até alguém
conferir em `pnpm db:studio` e marcar `active`. É deliberado — nunca
duplicamos nem publicamos jogador ambíguo em silêncio; o que não é mais
deliberado é travar quem já veio com identidade batendo.

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

**`vlr:schedule` pagina `/matches` até o fim** (`lastListPage`,
`lib/vlr/scrapers/match-list.ts`), com um teto de segurança
(`MAX_SCHEDULE_PAGES`, `lib/vlr/jobs/sync-schedule.ts`). A página 1 sozinha só
cobre alguns dias em semana cheia — um Champions ou Masters daqui a um mês fica
na página 2+, e sem paginar ele nunca chegava ao banco. `--pages=N` sobrepõe a
contagem anunciada, no mesmo molde de `vlr:results --pages`.

### A trava, do lado de quem compra e vende

`lockedOrganizations` (`lib/market/lock.ts`) aplica a mesma regra à
substituição, e é ela — não mais a coluna `round.market_closes_at` — que
`evaluateSubstitution` consulta:

- **fecha por campeonato, não por confronto.** Se VCT Americas joga hoje, todo
  jogador de Americas fica travado, jogue a organização dele hoje ou não. É o
  que impede ver o primeiro mapa do dia, entender que o meta mudou e reescalar
  quem entra em quadra às 22h;
- **vale pelos dois lados da troca** — comprar quem vai entrar em quadra e
  vender quem vai entrar em quadra são a mesma jogada, de pontas diferentes —
  e também pela braçadeira: dobrar a pontuação de quem já está entrando é
  trocá-lo de graça;
- **reabre no dia seguinte**, e não entre uma partida e a outra da mesma tarde.
  A partida de hoje que já terminou continua contando: é ela que define que o
  mercado daquele campeonato fechou hoje (`listMarketLockMatches` lê de ontem
  para frente exatamente por isso).

A janela da rodada (`round.market_opens_at` / `market_closes_at`) continua no
banco descrevendo a semana da rodada, mas não tranca mais ninguém. Sem rodada
ativa nada se move — é o `no-round`, um motivo de bloqueio distinto de
"mercado fechado", para o usuário nunca ler "o campeonato joga hoje" quando o
problema é outro.

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

### Ler o quadro de saúde (Decisão 7, plano 17)

`vlr_job_health` tem **uma linha por job**, sempre a última execução —
gravada por `runScript` (`scripts/vlr/run.ts`), no `finally` de todo
entrypoint, sem cada script precisar saber que isso existe.

```sql
-- o quadro inteiro, do mais recente para o mais atrasado
select job, last_status, last_finished_at, last_duration_ms, consecutive_failures
from vlr_job_health order by last_finished_at desc;
```

`pnpm vlr:health` (sem rede) aplica a tolerância de cada job
(`lib/vlr/jobs/health-policy.ts`) e sai com código ≠ 0 se alguém está
atrasado, nunca rodou, ou terminou em falha — é o comando que o
`healthcheck` do `docker-compose.yml` chama a cada 5 minutos, e que também
aparece embutido no resultado de `pnpm vlr:doctor`. Um container `unhealthy`
no `docker ps` (ou um `vlr:doctor` com exit ≠ 0) é o sinal de que algo parou;
nenhum dos dois reinicia sozinho — quem quiser isso precisa de um vigia
externo, que este pipeline não entrega.
