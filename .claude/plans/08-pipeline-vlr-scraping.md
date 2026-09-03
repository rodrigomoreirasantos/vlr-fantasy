# Pipeline de dados do vlr.gg — do scraping à pontuação real

## Context

`prompts/08_backend_scrap_information.md` pede o backend que transforma o jogo de fictício em real:
raspar o vlr.gg, persistir stats de partida e pontuar as escalações com o desempenho de verdade dos
jogadores. Hoje **nada disso existe** — e o buraco está documentado no próprio código:

1. **Não existe a camada `stats → pontos`.** `lib/scoring/team.ts:1-6` declara em comentário que ela
   "fica para uma fatia futura"; `player.score` é o ponto de entrada. Quem escreve `player.score` hoje
   é só `db/seed.ts:443` (números inventados à mão) e `db/close-round.ts:126` (zerar)./c
2. **Não existe id externo em nenhuma tabela.** A chave natural do jogador é o `nickname`
   (`player_nickname_uidx`), e `match` **não tem chave natural nenhuma** — o seed contorna com uma
   checagem manual (`db/seed.ts:353-368`).
3. **Nenhuma requisição HTTP sai da aplicação.** Não há `fetch`/`axios` em `app/`, `lib/`, `db/` nem
   `components/`; não há `cheerio`, fila, Redis ou logger.
4. **`round.totalMatches`/`scoredMatches` são lidas pela UI e nunca escritas** em produção (só pelo
   seed) — `lib/team/mappers.ts:70-73` mostra o card "Partidas Pontuadas" alimentado por dois inteiros
   que ninguém atualiza.
5. **A trava de escalação (regra inviolável nº 8) já existe, mas os dados não.** `isMarketOpen`
   (`lib/market/window.ts:11`) fecha o mercado em `round.marketClosesAt`, e `evaluateSubstitution` /
   `evaluateSale` já bloqueiam por `market-closed`. Falta alguém colocar ali o horário do **primeiro
   jogo da rodada**.
6. **Há muito a reaproveitar:** `closeActiveRound(tx)` (transação completa de virada de rodada),
   `lib/scoring/pricing.ts` (motor de preço com teto/piso e invariante que sustenta um CHECK do banco),
   `teamPoints` / `CAPTAIN_MULTIPLIER`, o padrão `Querier`/`Transaction`, as primitivas nomeadas
   mockáveis de `lib/*/queries.ts`, `isUniqueViolation` (`lib/db/errors.ts`) e o padrão de script
   standalone com `pathToFileURL` main guard (`db/close-round.ts:207-220`).

### ⚠️ O HTML do vlr.gg mudou — os seletores do prompt estão desatualizados

O prompt manda verificar os seletores contra a página real antes de implementar. **Já verifiquei**
(02/09/2026, requisições espaçadas em ~1,2s, User-Agent identificável). O que achei:

| Onde                  | Prompt (§2.3)                          | Realidade hoje                                                                                             |
| --------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Scoreboard da partida | `.wf-table-inset.mod-overview`, `<tr>` | **Não existe uma única tag `<table>` na página.** Virou `div.ovw-table` › `div.ovw-row` › `div.ovw-cell`   |
| Célula de stat        | `.mod-both` / `.mod-t` / `.mod-ct`     | **Confirmado**, agora como `span.side.mod-both` dentro de `div.ovw-cell[data-col]`                         |
| Identificar a coluna  | posição do `<td>`                      | **`data-col`**: `rating2`, `acs`, `kast`, `adr`, `hsp`, `fb`, `fd`; K/D/A em `span.ovw-kda-stat[data-col]` |
| Identidade do jogador | "só vem o nickname" (§ Fase 3)         | **Vem o vlrId**: `a[href="/player/49871/yuno"]` dentro de `.ovw-cell.mod-player`                           |
| Lista `/matches`      | `.match-item-vs-team-name` etc.        | **Confirmado, tudo bate** (50 cards/página)                                                                |

Duas armadilhas novas, ambas silenciosas:

- **`data-utc-ts` não é UTC.** A partida `724899` aparece como `5:00 PM` na lista e
  `data-utc-ts="2026-09-02 17:00:00"` no detalhe, rotulada "EDT" — os dois números são o **mesmo
  horário em America/New_York**. Ler o atributo como UTC desloca toda partida em 4–5h e quebra a trava
  de escalação. Conversão obrigatória com `dayjs.tz(ts, "America/New_York").utc()`.
- **A ordem dos spans `.mod-both`/`.mod-t`/`.mod-ct` varia por coluna** (`rating2` vem `t, ct, both`;
  `acs` vem `both, t, ct`). Pegar "o primeiro span" produz número errado sem erro nenhum.

**O achado que mais muda o plano:** o vlrId do jogador está no scoreboard. A "resolução de identidade
por nickname + time" que o prompt chama de _o desafio real_ (§Fase 3) deixa de ser heurística e vira
chave natural — `needsReview` continua existindo, mas para o caso raro, não para o caminho feliz.

### Decisões (confirmadas na entrevista)

| Pergunta    | Decisão                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquitetura | **Dentro deste repo, com Drizzle.** `lib/vlr/` + `scripts/vlr/`, mesma migration chain. Sem Fastify, sem Prisma. **Fase 6 do prompt (API REST + JWT) é descartada** — já existe como Server Actions + better-auth |
| Jobs        | **Fila no Postgres (`vlr_job_run`) + scripts `tsx`** disparados por cron. Sem Redis, sem BullMQ, sem worker de longa duração                                                                                      |
| Catálogo    | **Jogadores reais**, função via mapa determinístico agente→função, preço inicial derivado da média de fantasy points do backfill. Seed fictício vira só ambiente de dev                                           |
| Rodadas     | **Allowlist de eventos** (`vlr_event.tracked`) + **rodada semanal** criada pelo `syncSchedule`; `marketClosesAt` = kickoff do 1º jogo da semana (regra inviolável nº 8)                                           |

### Divergências deliberadas do prompt (todas justificadas)

| Prompt                        | Aqui                              | Por quê                                                                                                                                                                            |
| ----------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axios` + interceptors        | **`fetch` nativo**                | Node 22. O interceptor existia para hospedar o rate limit; com um cliente próprio isso é um `await limiter.acquire()` na única função de saída. −1 dependência                     |
| `pino`                        | **`lib/vlr/http/log.ts`**         | Log estruturado JSON em stdout são ~20 linhas. −1 dependência                                                                                                                      |
| Status `SCRAPED` no enum      | **`match.scrapedAt IS NOT NULL`** | Evita `ALTER TYPE … ADD VALUE` num enum já em uso, e "finalizada E extraída" fica derivada de um fato, não de dois campos que podem divergir                                       |
| `PlayerMatchStat` com `"all"` | **Só linhas por mapa**            | O prompt exige pontuar por mapa e somar; guardar também o agregado convida a somar duas vezes. A série é uma query (`SUM`), não uma linha                                          |
| Capitão ×1.5                  | **×2 (`CAPTAIN_MULTIPLIER`)**     | `lib/scoring/team.ts:10` já é a fonte única, interpolada num `sql` em `lib/championship/queries.ts:121` e coberta por testes. Mudar o número é decisão de produto, não desta fatia |

**Assumido (registrado para revisão):** o prompt pede valorização pela média **do próprio jogador**
(modelo Cartola). `lib/scoring/pricing.ts` já usa a média **da rodada**, com teto de 15%, piso, e uma
invariante da qual depende o CHECK `round_player_score_delta_consistent`. Mantenho a baseline atual e
acrescento só o amortecimento das primeiras rodadas que o prompt pede; trocar a baseline é passar outro
número para `averagePoints` — um parâmetro, não uma reescrita.

### Fora de escopo (explícito)

- **UI.** Nenhuma tela nova, nenhum componente. O pipeline alimenta as telas que já existem.
- **Fase 6 (API REST).** Descartada — o jogo já é exposto por Server Actions.
- **Endpoint admin de reprocessamento** (§Fase 7.3). O reprocessamento existe como **script**
  (`pnpm vlr:reprocess --match=<vlrId>`), lendo o HTML salvo. Tela de admin fica para outra fatia.
- Placar ao vivo, VODs, mapas de round-a-round (`vlr-rounds`), economia, clutches (o vlr não expõe
  clutch no overview).

---

## Princípio norteador

**O HTML bruto é o dado; tudo depois dele é recomputável.** Uma requisição por partida grava o arquivo
antes de qualquer parse — e a mesma partida nunca é buscada duas vezes (`scrapedAt`). Parser, pontuação
e preço são funções puras rodando sobre esse arquivo, então um seletor que quebrou, uma regra de scout
que mudou ou um bug de conversão de fuso se corrigem **reprocessando o disco**, sem uma única requisição
nova e sem perder histórico.

Disso decorre a ordem de dentro para fora, cada camada testável sozinha:

```
fetch (1 req/s, UA identificável)  →  arquivo .html.gz  →  parser puro (fixture)
   →  Zod  →  normalizador puro  →  upsert idempotente  →  scout puro  →  player.score
   →  closeActiveRound (já existe)
```

Nenhuma camada pula a anterior. O scraper não conhece o banco; o normalizador não conhece HTTP; o motor
de pontuação não conhece nem um nem outro.

---

## 1. Fundação (Fase 0)

**Dependência nova: `cheerio` (uma só).** `zod`, `dayjs`, `tsx`, `dotenv`, `vitest` e o Postgres do
`docker-compose.yml` já estão de pé. Sem Redis: `docker-compose.yml` não muda.

### 1.1 `lib/vlr/config.ts`

Env validada com Zod (schema interno → mensagens em inglês são aceitáveis, CLAUDE.md isenta env), lida
uma vez e congelada:

| Var                      | Default                     | Uso                                             |
| ------------------------ | --------------------------- | ----------------------------------------------- |
| `VLR_BASE_URL`           | `https://www.vlr.gg`        | baseURL do cliente                              |
| `VLR_CONTACT_EMAIL`      | — (obrigatória)             | entra no User-Agent                             |
| `VLR_USER_AGENT`         | `VlrFantasy/1.0 (+{email})` | nunca falsificar navegador (regra nº 3)         |
| `VLR_RATE_LIMIT_MS`      | `1100`                      | intervalo mínimo entre requisições (regra nº 2) |
| `VLR_REQUEST_TIMEOUT_MS` | `15000`                     | timeout                                         |
| `VLR_STORAGE_DIR`        | `storage/raw`               | HTML bruto (regra nº 4)                         |
| `VLR_SOURCE_TZ`          | `America/New_York`          | fuso em que o vlr renderiza `data-utc-ts`       |

`.env.example` ganha as chaves; `.gitignore` ganha `/storage`.

### 1.2 `lib/vlr/http/log.ts`

`logInfo(event, fields)` / `logWarn` / `logError` — um `console.log(JSON.stringify({ts, level, event, ...fields}))`.
Todo request e todo job logam `event`, `durationMs` e o desfecho.

---

## 2. Camada HTTP — o único portão de saída (Fase 1)

### 2.1 `lib/vlr/http/rate-limiter.ts`

Fila serial em singleton de módulo (o processo inteiro compartilha), garantindo `VLR_RATE_LIMIT_MS`
entre **inícios** de requisição:

```ts
let chain: Promise<void> = Promise.resolve();
let lastStartedAt = 0;
export function acquire(): Promise<void>; // encadeia e aguarda o gap
```

### 2.2 `lib/vlr/http/client.ts` — **nenhum outro módulo faz rede**

`fetchHtml(path: string, opts?): Promise<{ html: string; url: string; status: number }>`:

- `await acquire()` antes de cada tentativa — inclusive as de retry
- `User-Agent` de `config`, `Accept: text/html`
- `AbortSignal.timeout(VLR_REQUEST_TIMEOUT_MS)`
- retry com backoff exponencial (1s → 2s → 4s) em `429`, `503` e erro de rede; **3 tentativas**
- `4xx` que não seja 429 → `VlrHttpError` na hora, sem retry
- log estruturado: `url`, `status`, `durationMs`, `attempt`

### 2.3 `lib/vlr/http/raw-store.ts`

```ts
export type RawStore = {
  put(kind: string, id: string, html: string): Promise<string>; // devolve o path
  get(path: string): Promise<string>;
};
export const diskRawStore: RawStore; // storage/raw/{kind}/{id}/{ISO}.html.gz
```

Gzip com `node:zlib` (HTML de partida tem ~180 KB, ~20 KB comprimido). A interface é o ponto de troca
para S3 depois — quem chama nunca vê o disco. `get` é o que sustenta o reprocessamento.

**Ordem obrigatória em todo scraper: `fetchHtml` → `store.put` → parse.** Se o parse explodir, o
arquivo já está salvo.

---

## 3. Scrapers (Fase 2) — seletores já verificados

### 3.1 `lib/vlr/scrapers/selectors.ts` — o arquivo único

Todo seletor CSS mora aqui, em `const` tipadas e agrupadas por página. **Nenhuma string de seletor em
qualquer outro arquivo.** É o que transforma "o vlr mudou o layout" num diff de um arquivo.

### 3.2 `lib/vlr/scrapers/parse.ts` — helpers que falham alto

`text($el)`, `int()`, `pct()` ("65%" → 65), `decimal()` ("1.20" → 1.2), `vlrIdFromHref("/player/49871/yuno")` → `"49871"`,
e o mais importante:

```ts
/** Lança `SelectorMissError` com o seletor e a URL. Nunca devolve vazio em silêncio (regra nº 8 do CLAUDE.md do prompt). */
export function requireAll(
  $: CheerioAPI,
  selector: string,
  ctx: string,
): Cheerio<Element>;
```

### 3.3 `match-list.ts` — `/matches` e `/matches/results?page=N`

Mesmo card nas duas páginas: `a.wf-module-item.match-item`.

| Campo   | Origem                                                                   |
| ------- | ------------------------------------------------------------------------ |
| `vlrId` | `href` → `/724899/flyquest-red-vs-axolotl-…` → `724899`                  |
| times   | `.match-item-vs-team-name .text-of` (2 ocorrências)                      |
| placar  | `.match-item-vs-team-score`; `.mod-dash` presente = ainda não jogou      |
| data    | **`.wf-label.mod-large` acima do `.wf-card`** — "Wed, September 2, 2026" |
| hora    | `.match-item-time` — "5:00 PM", **America/New_York**                     |
| status  | `.match-item-eta .ml.mod-live` → `live`; placar preenchido → `finished`  |
| evento  | `.match-item-event` (+ `.match-item-event-series`)                       |

⚠️ A data só existe no cabeçalho de dia, **fora** do card — o parser precisa varrer o documento em
ordem, carregando o último `.wf-label.mod-large` visto. O horário exato e confiável vem depois, do
detalhe (`data-utc-ts`); a lista serve para descobrir _quais_ partidas existem.

`fetchMatchResults({ page })` paginado, com parada configurável (`stopAfterKnown: N` — para ao encontrar
N `vlrId` já com `scrapedAt` no banco).

### 3.4 `match-detail.ts` — `/{vlrId}/?game=all&tab=overview` (o mais importante)

**Uma requisição traz a série inteira:** o agregado e todos os mapas vêm no mesmo HTML, cada um num
`div.vm-stats-game[data-game-id]` (`"all"` + um id numérico por mapa; o mapa não jogado aparece só na
navegação, com `mod-disabled`).

Cabeçalho (`.match-header`):

- evento: `a.match-header-event[href="/event/3077/…"]` → vlrId do evento + nome
- **horário: `.match-header-date .moment-tz-convert[data-utc-ts]`** → `dayjs.tz(ts, VLR_SOURCE_TZ).utc()`
- times: `a.match-header-link[href="/team/17037/glacial-guardians"]` → vlrId + nome completo
- placar: `.match-header-vs-score-winner` / `-loser`; formato em `.match-header-vs-note` ("Bo3", "final")

Por mapa (`.vm-stats-game[data-game-id]` numérico):

- nome e duração: `.vm-stats-game-header .map` › primeiro `span`, `.map-duration`
- placar e vencedor: `.team .score`, com `.mod-win` no vencedor → alimenta o scout "vitória do mapa"
- linhas: `.ovw-table .ovw-row` (pular `.mod-head`)

Por jogador (`div.ovw-row`):

| Campo        | Seletor                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| vlrId + slug | `.ovw-cell.mod-player .ovw-player a[href]`                                       |
| nickname     | `.ovw-player-name`                                                               |
| tag do time  | `.ovw-player-tag` ("GG")                                                         |
| país         | `.ovw-player i.flag[title]` ("Austria") / classe `mod-at`                        |
| agente(s)    | `.ovw-agents img[title]` — **vários no agregado, um por mapa**                   |
| stats        | `.ovw-cell[data-col=…] span.side.mod-both`                                       |
| K/D/A        | `.ovw-cell.mod-kda span.ovw-kda-stat[data-col=kills\|deaths\|assists] .mod-both` |

`data-col`: `rating2`, `acs`, `kast`, `adr`, `hsp`, `fb`, `fd`. **Sempre `.mod-both` explícito** — a
ordem dos três spans muda de coluna para coluna.

### 3.5 `event-list.ts` — `/events`

`a.wf-card.mod-flex.event-item[href="/event/2776/vct-2026-pacific-stage-2"]`, com `.event-item-title`,
`.event-item-desc-item-status` (`ongoing`/`upcoming`/`completed`), `.mod-dates` ("Jul 15—Sep 6") e a
região na **classe da flag** de `.mod-location i.flag` (`mod-kr`), não em texto.
⚠️ As datas não trazem o ano — inferir do ano corrente e corrigir a virada (dez→jan).

### 3.6 `team-roster.ts` — `/team/{id}/{slug}`

`.team-roster-item` › `a[href="/player/17/theia"]`, `.team-roster-item-name-alias` (nickname),
`.team-roster-item-name-real`, `.team-roster-item-name-role` (**presente = staff**: coach, manager —
é o filtro que impede treinador virar jogador do fantasy).

### 3.7 Contrato de todo scraper

- **Zod valida a saída antes de retornar** (`lib/vlr/schemas.ts`) — nunca persiste o que não validou
- **Fixture de HTML real** em `lib/vlr/fixtures/` (as 5 páginas já baixadas nesta investigação servem)
- **Teste contra a fixture, sem rede** — o teste não importa `client.ts`
- Seletor sem resultado = `SelectorMissError` logado, nunca array vazio

---

## 4. Schema (Drizzle)

### 4.1 Tabelas novas

**`db/schema/vlr.ts`** — a camada de ingestão:

- **`vlr_event`** — `vlrId` text unique, `name`, `region`, `startsAt`/`endsAt` nullable, `status`,
  **`tracked` boolean default false** (a allowlist: só evento marcado gera rodada e catálogo).
- **`vlr_job_run`** — a fila: `job` text, `key` text (chave natural da unidade de trabalho, ex. o
  `vlrId` da partida), `status` (`pending`/`running`/`done`/`failed`/`dead`), `attempts`, `lastError`,
  `runAfter`, `startedAt`, `finishedAt`. **`uniqueIndex(job, key)`** — enfileirar duas vezes a mesma
  partida é um upsert, não uma linha nova. `dead` (após 3 tentativas) é a dead letter queue.

**`db/schema/player-match-stats.ts`**:

- **`player_match_stat`** — `matchId` FK cascade, `playerId` FK restrict, `mapName` text,
  `gameVlrId` text, `agent` text nullable, `rating numeric(5,2)`, `acs`/`kills`/`deaths`/`assists`/
  `kast`/`adr`/`headshotPct`/`firstKills`/`firstDeaths` integer nullable, **`won` boolean** (vitória do
  mapa, para o scout), `fantasyPoints numeric(6,1)` not null default 0, **`scoutVersion` integer** not
  null (regra usada no cálculo — o prompt exige versionar).
  `uniqueIndex(matchId, playerId, mapName)` = idempotência do reprocessamento.
  Índice `(playerId, matchId)` para o histórico do jogador.

**`db/schema/vlr-teams.ts`**:

- **`vlr_team`** — `vlrId` text unique, `name`, `tag`, `region`, `logoUrl`. É a **fonte canônica do
  nome da organização**: `player.team` e `match.teamA`/`teamB` passam a receber `vlr_team.name`, o que
  faz o cruzamento por igualdade de texto (`db/schema/matches.ts:29-31`) finalmente ser confiável sem
  a refatoração maior que aquele comentário adia.

### 4.2 Alterações em tabelas existentes

| Tabela   | Mudança                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `player` | `vlrId` text **unique nullable**, `realName`, `country`, `needsReview` boolean default false, `gamesPlayed` integer default 0, `averageScore numeric(6,1)` default 0                   |
| `match`  | `vlrId` text **unique nullable**, `eventId` FK→`vlr_event` nullable, `scrapedAt` timestamptz nullable, `rawHtmlPath` text nullable, `bestOf` integer nullable                          |
| `match`  | **`roundId` vira nullable** e a FK passa de `cascade` para `set null` — partida fora de escopo ou de semana ainda sem rodada precisa existir; apagar rodada não pode sumir com partida |
| `round`  | `weekKey` text **unique nullable** (`"2026-W37"`) — a chave que torna `syncSchedule` idempotente sem inventar `number`                                                                 |

`vlrId` nullable em `player`/`match` de propósito: os registros do seed continuam válidos, e o unique
com `NULLS DISTINCT` (padrão do Postgres) deixa vários nulos conviverem — o mesmo truque já usado em
`roster_slot_team_player_uidx` (`db/schema/roster.ts:46-48`).

Migration por `pnpm db:generate` + `pnpm db:migrate`. **Nenhum enum ganha valor novo** — é o motivo de
`SCRAPED` virar `scrapedAt`.

---

## 5. Normalização e persistência (Fase 3)

### 5.1 Puro, sem banco — `lib/vlr/normalize/`

- **`agent-role.ts`** — `agentToRole(agent: string): PlayerRole | null`, o mapa completo dos agentes de
  Valorant para `PLAYER_ROLES` (`lib/team/types.ts:12`): Jett/Raze/Reyna/Phoenix/Neon/Yoru/Iso →
  Duelista; Sova/Breach/Skye/KAY-O/Fade/Gekko/Tejo → Iniciador; Omen/Brimstone/Viper/Astra/Harbor/Clove →
  Controlador; Sage/Cypher/Killjoy/Chamber/Deadlock/Vyse → Sentinela.
  `primaryRole(agents: string[])` = função do agente mais jogado, empate resolvido pela ordem de
  `PLAYER_ROLES` (determinístico — dois backfills dão o mesmo resultado).
- **`kickoff.ts`** — `parseVlrTimestamp(ts: string): Date` = `dayjs.tz(ts, VLR_SOURCE_TZ).utc().toDate()`.
  Uma função, um teste, o bug de 4 horas morre aqui.
- **`week.ts`** — `weekKeyOf(date)` → `"2026-W37"`, semana ISO (segunda a domingo) em UTC.

### 5.2 Escrita — `lib/vlr/persist/*.ts`

Primitivas nomeadas no padrão de `lib/team/queries.ts` — assinatura `(tx: Querier, args)`, uma função
por unidade de escrita, cada uma mockável isoladamente (`lib/championship/queries.ts:315-317`).

- `upsertEvents`, `upsertTeams` — `onConflictDoUpdate` por `vlrId`
- `upsertMatches` — `onConflictDoUpdate` por `vlrId`; **nunca sobrescreve `scrapedAt`/`rawHtmlPath`**
- `resolvePlayer(tx, scraped)` — a resolução de identidade:
  1. `player.vlrId` bate → é ele, atualiza nickname/país/time
  2. não bate → `player.nickname` igual e `vlrId IS NULL` → **adota** o registro do seed (é o mesmo
     jogador, agora com id externo)
  3. nada bate → cria com `needsReview: true`, `active: false` (fica fora do mercado até revisão),
     `role` de `primaryRole`, preço no default. Colisão de nickname entre vlrIds diferentes é capturada
     com `isUniqueViolation` (`lib/db/errors.ts`) → sufixo e `needsReview`
     **Nunca duplica jogador em silêncio.**
- `saveMatchStats(tx, { matchId, rows })` — `onConflictDoUpdate` na tripla `(matchId, playerId, mapName)`;
  na mesma transação grava `match.scrapedAt`, `rawHtmlPath`, `status: "finished"`, placar e `bestOf`
- `syncRoundsFromMatches(tx)` — para cada `weekKey` com partida de evento `tracked`: upsert de `round`
  por `weekKey`, `number` = próximo sequencial, **`marketClosesAt` = menor `scheduledAt` da semana**
  (regra inviolável nº 8), `marketOpensAt` = fim da rodada anterior. Rodada nasce sempre `upcoming` —
  quem promove a `active` continua sendo `closeActiveRound`, preservando `round_single_active_uidx`.
  Também atualiza `round.totalMatches`/`scoredMatches`, hoje órfãs.

Tudo dentro de `db.transaction` (exigência do CLAUDE.md para saldo/pontuação).

### 5.3 Backfill

`pnpm vlr:backfill --pages=20` — percorre `/matches/results`, enfileira `scrape-match` para cada partida
de evento `tracked`, e ao fim calcula `player.gamesPlayed`, `averageScore` e o **preço inicial**
(`averageScore × PRICE_PER_POINT_CENTS`, com piso `MIN_PRICE_CENTS`).
**Critério de aceite:** rodar duas vezes seguidas → contagem idêntica em `player`, `match` e
`player_match_stat`.

---

## 6. Motor de pontuação (Fase 4)

### 6.1 `lib/scoring/scout.ts` (novo) — a metade que faltava

Fecha o TODO de `lib/scoring/team.ts:1-6`. Regras em **dado, não em código**:

```ts
export const SCOUT_VERSION = 1;
export const SCOUT_RULES = {
  perEvent: { kill: 2, death: -1, assist: 0.5, firstKill: 1.5, firstDeath: -1 },
  // Faixas EXCLUSIVAS, avaliadas de cima para baixo: ACS 260 vale +3, não +4.5.
  tiers: [
    { stat: "acs", min: 250, points: 3 },
    { stat: "acs", min: 200, points: 1.5 },
    { stat: "kast", min: 75, points: 2 },
    { stat: "adr", min: 150, points: 2 },
    { stat: "rating", min: 1.2, points: 3 },
  ],
  penalties: [{ stat: "rating", below: 0.8, points: -2 }],
  mapWin: 2,
} as const;

export function mapPoints(stat: MapStatInput, rules = SCOUT_RULES): number;
export function seriesPoints(maps: readonly MapStatInput[]): number; // soma por mapa
```

Puro, sem banco, sem React — testável em milissegundos, como `pricing.ts` e `standings.ts`.
As faixas exclusivas são uma decisão explícita: a tabela do prompt é ambígua e o empilhamento premiaria
duas vezes o mesmo ACS.

### 6.2 `calculateRound` — stats viram `player.score`

Job idempotente: soma `player_match_stat.fantasyPoints` das partidas da rodada e faz
`player.score = <soma>` (**atribuição, nunca `+=`** — é o que torna recalcular seguro). Depois disso o
fluxo já existente assume: `closeActiveRound(tx)` congela os três snapshots, reprecifica via
`nextPriceCents` e promove a próxima rodada. **Nenhuma regra de virada é reescrita.**

### 6.3 Amortecimento em `lib/scoring/pricing.ts`

Único acréscimo ao motor existente: `dampingFactor(gamesPlayed)` — 0.25 na 1ª rodada, 0.5 na 2ª, 1.0 a
partir da 4ª, multiplicando o delta **antes** do teto e do piso, para a invariante
`nextPriceCents(x) - x === priceDeltaCents(x)` (e o CHECK do banco) continuar verdadeira.

---

## 7. Jobs e agendamento (Fase 5)

`lib/vlr/jobs/queue.ts` sobre `vlr_job_run`: `enqueue(job, key)` (upsert → `pending`),
`claim(job)` (`UPDATE … SET status='running' … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`),
`complete(id)`, `fail(id, error)` (incrementa `attempts`, backoff exponencial em `runAfter`, `dead` na 3ª).

| Script               | Cron    | Faz                                                                                         |
| -------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `pnpm vlr:events`    | semanal | `/events` → upsert `vlr_event` (a flag `tracked` é sua, não do scraper)                     |
| `pnpm vlr:schedule`  | 06:00   | `/matches` → upsert `match` de eventos `tracked` → `syncRoundsFromMatches`                  |
| `pnpm vlr:results`   | */15min | `/matches/results` → marca `finished`, enfileira `scrape-match` das que não têm `scrapedAt` |
| `pnpm vlr:work`      | */5min  | Consome a fila: 1 partida por job, falha isolada não derruba o lote                         |
| `pnpm vlr:round`     | */30min | Se toda partida da rodada tem `scrapedAt` → `calculateRound` + `closeActiveRound`           |
| `pnpm vlr:doctor`    | diário  | Health check de seletores (§8)                                                              |
| `pnpm vlr:backfill`  | manual  | Carga histórica                                                                             |
| `pnpm vlr:reprocess` | manual  | Reparsa do HTML salvo, **sem rede**                                                         |

Todos entrypoints em `scripts/vlr/`, com o main guard `pathToFileURL` e o
`.finally(() => pool.end())` de `db/close-round.ts:207-220`. Agendamento: cron do sistema ou GitHub
Actions — nenhum processo de longa duração.

**Regra nº 7 (cache permanente) é uma cláusula `WHERE`:** partida com `scrapedAt IS NOT NULL` nunca é
enfileirada de novo.

---

## 8. Observabilidade (Fase 7)

- **`pnpm vlr:doctor`** — o job que impede descobrir o parser quebrado por reclamação de usuário: baixa
  as 4 páginas-chave e roda cada scraper, reportando por seletor `ok` / `0 resultados` / erro, com exit
  code ≠ 0 se algum falhar. É a mesma função dos testes, só que contra a rede.
- **Métricas** — `vlr_job_run` já responde taxa de sucesso, duração e tentativas por SQL; soma-se a
  contagem de `player.needsReview`.
- **`docs/SCRAPING.md`** — a estrutura real do vlr (§3 deste plano), a armadilha do `data-utc-ts`, a dos
  spans `.mod-both`, e o passo a passo de corrigir um seletor e reprocessar do disco.

---

## Arquivos tocados

| Arquivo                                                                                  | Mudança                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `package.json`                                                                           | `cheerio` + 8 scripts `vlr:*`                          |
| `lib/vlr/config.ts` · `http/{log,rate-limiter,client,raw-store}.ts`                      | **novos** — o portão de saída                          |
| `lib/vlr/scrapers/{selectors,parse,match-list,match-detail,event-list,team-roster}.ts`   | **novos**                                              |
| `lib/vlr/schemas.ts`                                                                     | **novo** — Zod de saída de cada scraper                |
| `lib/vlr/normalize/{agent-role,kickoff,week,match,player}.ts`                            | **novos** — puros                                      |
| `lib/vlr/persist/{events,teams,matches,players,stats,rounds}.ts`                         | **novos** — primitivas nomeadas                        |
| `lib/vlr/jobs/{queue,sync-schedule,sync-results,scrape-match,calculate-round,doctor}.ts` | **novos**                                              |
| `lib/vlr/fixtures/*.html`                                                                | **novos** — as 5 páginas reais já baixadas             |
| `scripts/vlr/*.ts`                                                                       | **novos** — 8 entrypoints `tsx`                        |
| `lib/scoring/scout.ts`                                                                   | **novo** — `stats → pontos`, versionado                |
| `lib/scoring/pricing.ts`                                                                 | `dampingFactor(gamesPlayed)`                           |
| `db/schema/{vlr,vlr-teams,player-match-stats}.ts`                                        | **novos**                                              |
| `db/schema/{players,matches,rounds}.ts`                                                  | `vlrId` e campos de ingestão; `match.roundId` nullable |
| `db/schema/{index,relations}.ts`                                                         | barrel + relations das tabelas novas                   |
| `drizzle/00XX_*.sql`                                                                     | **gerado** — não editar                                |
| `.env.example` · `.gitignore` · `docs/SCRAPING.md`                                       | 7 chaves novas · `/storage` · documentação             |

---

## Ordem de execução

0. Copiar este plano para `.claude/plans/08-pipeline-vlr-scraping.md` (convenção do projeto).
1. **Puro, sem rede e sem banco** — `scout.ts`, `agent-role.ts`, `kickoff.ts`, `week.ts`,
   `dampingFactor` + testes. Tudo verde antes de qualquer requisição.
2. **HTTP** — `config`, `log`, `rate-limiter`, `client`, `raw-store` + teste do rate limiter.
   Aceite: script disparando 5 requisições mostra ~1,1s de espaçamento nos logs.
3. **Fixtures + scrapers + Zod + testes**, na ordem `match-detail` → `match-list` → `event-list` →
   `team-roster`. `match-detail` primeiro por ser o que carrega todo o valor e todas as armadilhas.
4. **Schema + migration** — `pnpm db:generate` → `pnpm db:migrate`. Conferir no `db:studio` que o seed
   antigo sobreviveu (`vlrId` nulo em todo lugar).
5. **Persistência** — `persist/*` + testes com `db` mockado (padrão `vi.hoisted` + `txStub` de
   `app/(app)/my-team/actions.test.ts:1-59`).
6. **Fila + jobs + scripts.** `vlr:events` → marcar `tracked` à mão no `db:studio` → `vlr:schedule`.
7. **Backfill** (`--pages=5` primeiro, depois 20). **Passo de maior risco** — conferir `needsReview`,
   preços `> 0` e rodar duas vezes para provar a idempotência.
8. `calculate-round` + integração com `closeActiveRound`.
9. `vlr:doctor` + `docs/SCRAPING.md`.
10. `pnpm test` → `pnpm lint` → `pnpm exec prettier --write .` → `pnpm build`.

---

## Verificação

### Testes (Vitest, `pnpm test`) — banco sempre mockado, nenhum teste faz rede

**Puros:** `scout.test.ts` (performance excelente/mediana/ruim com números conferidos à mão; faixas de
ACS **não** empilham; vitória do mapa soma; série = soma dos mapas); `agent-role.test.ts` (agente
desconhecido devolve `null`, empate é determinístico); `kickoff.test.ts` (**`"2026-09-02 17:00:00"` →
`2026-09-02T21:00:00Z`** — o teste que trava o bug de 4h; `TZ: "UTC"` do `vitest.config.ts:10-12` o
mantém determinístico); `week.test.ts` (virada de ano); `pricing.test.ts` (novos casos de amortecimento,
mantendo a invariante `nextPriceCents(x) - x === priceDeltaCents(x)`).

**Scrapers, contra fixture:** `match-detail.test.ts` extrai os 10 jogadores com stats coerentes, pega
`.mod-both` **na coluna cujos spans vêm fora de ordem** (`rating2`), separa os mapas por `data-game-id`,
marca `won` pelo `.mod-win` e lê o vlrId do `href`; `match-list.test.ts` associa cada card ao
`.wf-label.mod-large` correto e distingue `mod-dash` de placar real; `team-roster.test.ts` **exclui
staff** por `.team-roster-item-name-role`; `event-list.test.ts` lê região da classe da flag. Em todos:
seletor que não bate lança `SelectorMissError`, nunca devolve `[]`.

**Rate limiter:** 3 chamadas concorrentes levam ≥ 2,2s (fake timers).

**Persistência (db mockado):** `resolvePlayer` adota o registro do seed quando o nickname bate e
`vlrId` é nulo; cria com `needsReview` quando não acha; **nunca duplica**; colisão de nickname entre
vlrIds diferentes não derruba o job. `saveMatchStats` faz upsert na tripla e grava `scrapedAt` na mesma
transação. `syncRoundsFromMatches` põe em `marketClosesAt` o kickoff do primeiro jogo e cria a rodada
como `upcoming`.

### Manual (com o Postgres local de pé)

1. `pnpm vlr:events` → `vlr_event` populada; marcar 3-4 eventos VCT como `tracked` no `db:studio`.
2. `pnpm vlr:schedule` → partidas dos eventos marcados em `match`, rodadas semanais criadas, e
   **`round.marketClosesAt` igual ao horário do primeiro jogo da semana** (conferir contra o site — é
   a regra inviolável nº 8).
3. `pnpm vlr:backfill --pages=5` → conferir `storage/raw/match/*/*.html.gz` gravado, `player` com
   `vlrId`, `player_match_stat` com linhas por mapa e `fantasyPoints` plausíveis. **Rodar de novo: as
   contagens têm de ser idênticas.**
4. Abrir uma partida no vlr.gg e comparar K/D/A, ACS e rating de um jogador com a linha do banco.
5. `pnpm vlr:round` → `player.score` preenchido; `/my-team` e `/home` mostram pontuação **real**;
   `pnpm db:round:close` reprecifica e o mercado abre com preços novos.
6. Com a rodada em andamento (após `marketClosesAt`), tentar substituir em `/my-team` → bloqueado por
   "mercado fechado", sem nenhum código novo: é `isMarketOpen` operando sobre o dado certo.
7. `pnpm vlr:doctor` → todos os seletores `ok`. Depois, quebrar um seletor de propósito em
   `selectors.ts` e confirmar que o doctor falha com exit code ≠ 0 e nomeia o seletor.
8. `pnpm vlr:reprocess --match=<vlrId>` com o Wi-Fi desligado → reparsa do disco, sem rede.
9. Observar o espaçamento nos logs de qualquer job: nunca menos de ~1,1s entre requisições.
