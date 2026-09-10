# Scrap automático — sem comando, sempre em dia

## Context

`prompts/17_cron_job_scap.md` pede que o scrap do plano 08 rode sozinho, sem nenhum comando
manual, sempre com a informação mais atual, e que **jogos, times, região e jogadores** sigam o
que o vlr.gg diz. Vasculhando o código, o pedido esbarra em dez fatos:

1. **A automação já existe no repo, mas não está ligada.** `deploy/vlr-cron/` tem Dockerfile,
   `docker-compose.yml`, `entrypoint.sh` e um crontab de sistema com 7 linhas
   (`deploy/vlr-cron/crontab:18-40`). Nada disso roda 24/7 hoje — é infraestrutura escrita e
   nunca subida.
2. **A allowlist de campeonatos é 100% humana.** `db/schema/vlr.ts:35-40` declara que só evento
   marcado à mão entra; `lib/vlr/persist/events.ts:8-9` garante que o scraper **nunca** escreve
   `tracked`; `scripts/vlr/events.ts:13` imprime "marque no `pnpm db:studio`". Como
   `findMatchesToScrape` (`lib/vlr/jobs/sync-results.ts:31-38`) e `listUpcomingMatches`
   (`lib/round/queries.ts:109-116`) fazem `INNER JOIN` exigindo `tracked = true`, **um Masters
   novo não entra no jogo sozinho, nunca**.
3. **Troca de jogador de time só chega se o jogador jogar.** `player.team` é escrito por
   `resolvePlayer` a partir do scoreboard (`lib/vlr/persist/players.ts:52-105`). O parser de
   elenco existe e funciona (`lib/vlr/scrapers/team-roster.ts:26-79`), mas **nenhum job o
   chama** — só o health check (`lib/vlr/jobs/doctor.ts:77-83`). A fila conhece um único tipo de
   trabalho (`lib/vlr/jobs/types.ts:20-23`).
4. **Partida já extraída nunca é relida.** A regra de cache permanente é a cláusula
   `WHERE scraped_at IS NULL` (`lib/vlr/jobs/sync-results.ts:22-38`). Se o vlr corrigir uma
   estatística depois, o número errado fica no banco para sempre.
5. **E `pnpm vlr:reprocess` não conserta isso.** Ele reparsa o **HTML salvo**
   (`lib/vlr/jobs/scrape-match.ts:46-64`) — reprocessar um arquivo velho devolve o mesmo dado
   velho. Correção do vlr só chega com requisição nova.
6. **Partida cancelada vira fantasma, e ele trava a rodada.** Não existe status "cancelada"
   (`lib/round/types.ts:4`) e `upsertMatches` nunca apaga (`lib/vlr/persist/matches.ts:66-84`).
   Um card que some do vlr continua `upcoming` para sempre: ancora o `marketClosesAt` da semana
   (`lib/vlr/persist/rounds.ts:34-46,80`), faz `countMatchesInPlay` acusar "tem jogo agora" por
   12h (`lib/vlr/jobs/cadence.ts:46-66`) e — o pior — **impede a rodada de fechar**:
   `runRoundJob` só pontua quando `count(*) filter (where scraped_at is null) = 0`
   (`lib/vlr/jobs/calculate-round.ts:73-85`), e o fantasma nunca terá `scrapedAt`.
7. **Dois scripts prontos ficaram fora do cron.** `vlr:regions` e `vlr:activate-reviewed`
   existem em `package.json:19,22` e não estão em `deploy/vlr-cron/crontab`. Região de jogador
   só é recalculada em `pnpm db:migrate` (`package.json:9`), no backfill, ou por partida
   (`applyMatchPlayerRegions`, `lib/vlr/jobs/scrape-match.ts:191`); jogador `needs_review` fica
   fora do mercado até alguém rodar comando.
8. **Ninguém é avisado quando o pipeline para.** `vlr:doctor` devolve exit code e uma linha JSON
   no log do container (`lib/vlr/jobs/doctor.ts:93-99`); não há tabela de saúde, nem
   `healthcheck` no compose, nem qualquer registro no banco de "quando este job rodou pela
   última vez".
9. **O calendário tem até 24h de atraso.** `vlr:schedule` roda 1×/dia
   (`deploy/vlr-cron/crontab:21`); remarcação de horário só chega no dia seguinte.
10. **Não existe porta de entrada na aplicação.** Só há `app/api/auth/[...all]/route.ts`; não
    há route handler de pipeline, tela de admin nem papel de administrador (nenhuma ocorrência
    de `admin` em `app/`, `lib/`, `db/schema`).

**Resultado esperado:** ninguém digita comando nenhum. Campeonato novo do circuito entra
sozinho; resultado de partida vira pontuação em ~1 a 3 minutos; transferência de jogador aparece
no dia seguinte sem ele precisar jogar; partida cancelada some do calendário e para de travar
mercado e rodada; e, se o pipeline parar, o quadro de saúde no banco e o `doctor` diário dizem
qual job atrasou e desde quando.

---

## ⚠️ Divergência deliberada — o gatilho pedido não existe, e a evidência é esta

O pedido diz, com todas as letras: _"O trigger para o scrap acontecer deve depender de qualquer
mudança no website"_ e _"o scrap deve acontecer assim que algo for mudado no website"_.

**Não há como o vlr.gg nos avisar.** É site de terceiro: não publica webhook, não tem push, e
não somos clientes dele. Verifiquei ainda a única alternativa barata que o HTTP oferece — o
"me diga só se mudou" (`If-None-Match` / `If-Modified-Since`). Duas requisições, com
User-Agent identificável e espaçadas, em 10/09/2026:

```
$ curl -sI https://www.vlr.gg/matches
$ curl -sI "https://www.vlr.gg/724899/?game=all&tab=overview"

HTTP/2 200
cache-control: no-store, no-cache, must-revalidate
pragma: no-cache
```

**Sem `ETag`. Sem `Last-Modified`. E `no-store` explícito** — o servidor desliga cache de
propósito. Ou seja: nem push, nem HTTP condicional. A única forma de saber que algo mudou é
**baixar a página e comparar**.

Então o que este plano entrega, no lugar do gatilho:

| O pedido                     | O que é entregue                                                                                            | Custo                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Disparar quando o site mudar | **Perguntar de minuto em minuto enquanto há jogo** (`isMatchWindow` já existe e já decide isso)             | 1 requisição/min só em janela de partida; fora dela, nenhuma — só uma consulta ao banco    |
| "Só processar o que mudou"   | **Impressão digital (hash) do conteúdo já interpretado**: payload idêntico → nada de parse, escrita ou fila | A **requisição continua acontecendo** — é o que o `no-store` sem `ETag` nos obriga a fazer |
| Latência zero                | **~1 a 3 minutos** entre o vlr publicar o resultado e a pontuação aparecer no jogo                          | Regra de convivência de 1 req/1,1s (`docs/SCRAPING.md:25-36`) intacta                      |

Isto está aqui em cima, e não num rodapé, porque é a única parte do pedido que **não** é
entregue como escrita. Prometer "assim que mudar" seria mentir sobre o que o vlr.gg permite.

---

## Decisões (fechadas na entrevista — não reabrir)

| #   | Decisão                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **O agendador ainda não roda em lugar nenhum, e subir isso faz parte do plano.** Entra o container de pé, `healthcheck` no compose e um relatório de última execução visível no banco.                                                                                                                               |
| 2   | **Rápido só quando há jogo:** 1 minuto em janela de partida, ritmo lento fora dela; impressão digital do conteúdo para não reprocessar página idêntica. Regra de 1 req/1,1s honrada.                                                                                                                                 |
| 3   | **Campeonato novo entra sozinho, com veto humano:** evento do circuito oficial (VCT das 4 ligas, Masters, Champions) em `ongoing`/`upcoming` vira `tracked` automaticamente. A decisão humana continua mandando e **o automático nunca a sobrescreve**.                                                              |
| 4   | **Job novo de elencos, diário**, para os times dos campeonatos seguidos: 1 requisição por time, atualiza organização/apelido/nome real/país e sinaliza quem saiu do elenco, reusando `lib/vlr/scrapers/team-roster.ts` e a fila. **Estreante não entra no mercado antes de jogar** (nasceria sem histórico e preço). |
| 5   | **Uma releitura tardia por partida**, ~6h depois da extração e dentro da janela de 48h. Payload idêntico → nada é reprocessado nem regravado. Custo aceito: 1 requisição extra por partida, uma única vez.                                                                                                           |
| 6   | **Partida sumida é marcada, nunca apagada:** ausente em 2 varreduras seguidas de `/matches`, deixa de contar para calendário, trava de mercado, cadência e fechamento de rodada. A linha e o histórico permanecem no banco.                                                                                          |
| 7   | **Batimento no banco + doctor que reprova por atraso:** cada execução grava desfecho e duração; o doctor diário falha se algum job atrasou além do esperado; o quadro é legível no `db:studio` e no log do container. **Sem** aviso na tela do jogo e **sem** notificação externa.                                   |
| 8   | **Rede de segurança diária para jogador ambíguo:** `vlr:activate-reviewed` entra no cron e libera **só** identidade confiável (id do vlr, agente batendo com a função, sem colisão de apelido). O ambíguo de verdade continua esperando humano e aparece contado no relatório de saúde.                              |

Resolvido por mim, por não haver alternativa razoável a discutir (registrado aqui para não
parecer omissão): **`vlr:regions` passa a rodar diariamente no cron**, logo depois de
`vlr:round` — é idempotente, não vai à rede, e a ausência dele é o que deixa jogador fora das
abas de escalação; e **a impressão digital serve para pular parse e escrita, nunca a
requisição** — o `no-store` sem `ETag` acima não deixa outra saída.

---

## Fase 0 — O que é puro: regra, digital e política de saúde

Sem rede e sem banco. Tudo aqui é função pura, testável em milissegundos, no mesmo molde de
`lib/vlr/normalize/week.ts` e `lib/scoring/scout.ts`.

**Arquivos**

- **Novo:** `lib/vlr/normalize/tracking.ts` + `tracking.test.ts`
- **Novo:** `lib/vlr/http/fingerprint.ts` + `fingerprint.test.ts`
- **Novo:** `lib/vlr/jobs/health-policy.ts` + `health-policy.test.ts`

### 0.1 A regra de "campeonato do circuito" (Decisão 3)

```ts
/** O evento é do circuito que o fantasy segue? Só nome e status — nada de banco. */
export function isCircuitEvent(event: {
  name: string;
  status: string;
}): boolean;
```

Casa: `VCT` seguido de `Americas` | `EMEA` | `Pacific` | `China` (com ou sem ano/etapa),
`Masters`, `Champions`. **Não** casa: `Challengers`, `Game Changers`, `Ascension`,
`Off Season`, `Showmatch` — o fantasy é sobre o circuito principal, e um catálogo cheio de
torneio amador é o que a allowlist manual existia para evitar. Status aceito: `ongoing` e
`upcoming` (o vlr rotula assim, `lib/vlr/scrapers/event-list.ts`).

**A regra só liga, nunca desliga.** Um evento que termina não é destracado: `listMarketLockMatches`
e `listOrganizationMatches` (`lib/round/queries.ts:304-332,400-410`) leem histórico por
`tracked = true`, e apagar a marca de um Champions encerrado apagaria a região das organizações
que jogaram nele. Quem desliga é só o humano, pela Decisão 3.

### 0.2 A impressão digital (Decisões 2 e 5)

```ts
/** SHA-256 do JSON canônico (chaves ordenadas, datas em ISO) de um payload já interpretado. */
export function fingerprint(value: unknown): string;
```

**Do payload interpretado, não do HTML bruto** — e isto é uma escolha, não um detalhe: a página
do vlr carrega carimbos relativos ("2d ago"), cookie de sessão e blocos que mudam a cada leitura,
então o hash do HTML quase nunca repetiria e a economia seria zero. O hash da saída do parser
(que já passa por Zod, `lib/vlr/schemas.ts`) muda **quando o conteúdo que nos interessa muda**.
O parse é local e custa milissegundos; o que ele evita é escrita no banco, enfileiramento e
reprocessamento.

### 0.3 A política de saúde (Decisão 7)

```ts
export const JOB_MAX_AGE_MS: Record<string, number>;
export type JobHealthRow = {
  job: string;
  lastFinishedAt: Date | null;
  lastStatus: "ok" | "failed" | null;
};
/** Quais jobs estão atrasados ou nunca rodaram — pura, recebe as linhas prontas. */
export function staleJobs(rows: readonly JobHealthRow[], now: Date): string[];
```

| Job                     | Tolerância |
| ----------------------- | ---------- |
| `vlr:results`           | 5 min      |
| `vlr:work`              | 5 min      |
| `vlr:round`             | 20 min     |
| `vlr:revalidate`        | 90 min     |
| `vlr:schedule`          | 8 h        |
| `vlr:rosters`           | 30 h       |
| `vlr:regions`           | 30 h       |
| `vlr:activate-reviewed` | 30 h       |
| `vlr:doctor`            | 30 h       |
| `vlr:events`            | 8 dias     |

Job que **nunca** rodou também é `stale` — é exatamente o sintoma de "subi o container e o cron
não está disparando".

**Testes:** `isCircuitEvent` aceita "VCT 2026 Pacific: Stage 2" e "Valorant Champions 2026" e
recusa "Challengers League: Brazil" e evento `completed`; `fingerprint` é estável à ordem das
chaves do objeto e muda com qualquer valor; `staleJobs` acusa o que nunca rodou, o atrasado e o
que terminou em falha, e ignora o que rodou dentro da tolerância.

**Como verificar:** `pnpm test` verde antes de qualquer requisição ou migration.

---

## Fase 1 — Schema e migration

**Arquivos**

- **Muda:** `db/schema/vlr.ts` (coluna nova em `vlr_event`; duas tabelas novas)
- **Muda:** `db/schema/matches.ts` (4 colunas)
- **Muda:** `db/schema/players.ts` (1 coluna)
- **Muda:** `db/schema/index.ts` e `db/schema/relations.ts` (barrel das tabelas novas)
- **Muda:** `lib/vlr/jobs/types.ts` (novos tipos de trabalho na fila)
- **Gerado:** `drizzle/00XX_*.sql` — **nunca editado à mão**

| Tabela / coluna               | Tipo                                                                                                                                         | Para quê                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `vlr_event.tracked_override`  | `boolean` **nullable**                                                                                                                       | O veto humano da Decisão 3. `null` = o automático decide; `true`/`false` = a pessoa decide, e o automático nunca escreve por cima. |
| `match.content_hash`          | `text` nullable                                                                                                                              | Digital do payload da última extração — base da Decisão 5.                                                                         |
| `match.revalidated_at`        | `timestamptz` nullable                                                                                                                       | A releitura tardia já aconteceu (uma por partida).                                                                                 |
| `match.missing_since`         | `timestamptz` nullable                                                                                                                       | Primeira varredura em que o card sumiu de `/matches`.                                                                              |
| `match.dismissed_at`          | `timestamptz` nullable                                                                                                                       | Confirmada sumida (2ª varredura). **É esta coluna que todas as leituras passam a filtrar.**                                        |
| `player.roster_missing_since` | `timestamptz` nullable                                                                                                                       | Saiu do elenco da organização (Decisão 4) — sinalização, não remoção do mercado.                                                   |
| **`vlr_job_health`** (nova)   | `job` unique, `last_status`, `last_started_at`, `last_finished_at`, `last_duration_ms`, `last_summary`, `last_error`, `consecutive_failures` | O batimento da Decisão 7: uma linha por job, sempre a última execução.                                                             |
| **`vlr_page_state`** (nova)   | `path` unique, `content_hash`, `fetched_at`, `changed_at`, `unchanged_runs`                                                                  | A digital das páginas de lista (Decisão 2).                                                                                        |

`lib/vlr/jobs/types.ts` ganha dois trabalhos na fila, cada um com sua chave natural:

```ts
export const VLR_JOBS = {
  scrapeMatch: "scrape-match", // chave: vlrId da partida
  revalidateMatch: "revalidate-match", // chave: vlrId da partida (Decisão 5)
  scrapeRoster: "scrape-roster", // chave: vlrId do time (Decisão 4)
} as const;
```

Nenhum `pgEnum` ganha valor novo: "sumida" é `dismissed_at IS NOT NULL`, um fato datado, pelo
mesmo motivo que `SCRAPED` virou `scrapedAt` no plano 08 (`db/schema/matches.ts:54-60`). Índices
novos: `match(dismissed_at)` parcial `where dismissed_at is null` e
`match(revalidated_at, scraped_at)`, os dois exatamente no formato das cláusulas das Fases 3 e 4.

**Como verificar:** `pnpm db:generate` → `pnpm db:migrate` → abrir `pnpm db:studio` e conferir
que **nenhuma linha existente mudou** (todas as colunas novas nulas, `tracked` intacto) e que a
migration não tocou em saldo, escalação ou histórico.

---

## Fase 2 — Campeonato novo entra sozinho (Decisão 3)

**Arquivos**

- **Muda:** `lib/vlr/persist/events.ts` (função nova `applyAutoTracking`)
- **Novo:** `lib/vlr/persist/events-tracking.test.ts`
- **Muda:** `lib/vlr/jobs/sync-events.ts` (chama a função dentro da mesma transação)
- **Muda:** `scripts/vlr/events.ts` (resumo passa a dizer quantos passaram a ser seguidos)

`upsertEvents` continua **sem tocar em `tracked`** — a garantia de `events.ts:8-9` fica de pé. A
escrita passa a ser de uma função separada e explícita:

```ts
/** Liga `tracked` para todo evento do circuito cujo veto humano é `null`. Nunca desliga. */
export async function applyAutoTracking(
  tx: Querier,
): Promise<{ tracked: string[] }>;
```

A cláusula, em Drizzle (nunca SQL cru): `where(and(isNull(vlrEvent.trackedOverride), eq(vlrEvent.tracked, false)))`,
filtrando em memória por `isCircuitEvent` (Fase 0) e atualizando só os que casam. Quem tem
`trackedOverride = false` nunca é ligado; quem tem `trackedOverride = true` já está ligado por
um `$onUpdate` do próprio veto.

**Testes** (db mockado, padrão `vi.hoisted` + `txStub` de `lib/vlr/jobs/sync-schedule.test.ts:1-50`):
liga um "VCT 2026 Americas: Stage 2" `ongoing`; **não** liga um "Challengers"; **não** liga
quem tem `trackedOverride = false`, mesmo casando com a regra; não desliga evento `completed` já
seguido; roda duas vezes e o segundo `update` não acontece (idempotência).

**Como verificar:** `pnpm vlr:events` uma vez, e no `db:studio` os campeonatos do circuito
aparecem `tracked = true` sem ninguém ter clicado; marcar `tracked_override = false` num deles e
rodar de novo — ele não volta.

---

## Fase 3 — Partida cancelada para de assombrar (Decisão 6)

**Arquivos**

- **Muda:** `lib/vlr/persist/matches.ts` (nova `markMissingMatches`)
- **Novo:** `lib/vlr/persist/matches-missing.test.ts`
- **Muda:** `lib/vlr/jobs/sync-schedule.ts` (chama a marcação no fim da varredura)
- **Muda:** `lib/round/queries.ts` (5 leituras), `lib/vlr/jobs/cadence.ts`,
  `lib/vlr/jobs/calculate-round.ts`, `lib/vlr/persist/rounds.ts` (2 leituras)
- **Mudam:** os `.test.ts` correspondentes

### 3.1 A marcação

```ts
export async function markMissingMatches(
  tx: Querier,
  args: { seenVlrIds: readonly string[]; horizonAt: Date; sweptAt: Date },
): Promise<{ flagged: number; dismissed: number; restored: number }>;
```

Regra, nesta ordem:

1. **Card visto de novo** → `missingSince` e `dismissedAt` voltam a `null` (partida remarcada
   ressuscita sozinha).
2. **Ausente e `missingSince IS NULL`** → grava `missingSince = sweptAt`. Nada mais muda.
3. **Ausente e `missingSince < sweptAt`** (é a 2ª varredura seguida) → grava `dismissedAt`.

**A trava de segurança, e ela não é opcional:** só entram na conta partidas de evento `tracked`,
com `status = 'upcoming'`, `scrapedAt IS NULL` e `scheduledAt` entre agora e `horizonAt` — onde
`horizonAt` é o **maior `scheduledAt` que a varredura de fato enxergou**. Sem isso, a primeira
partida além do teto de paginação (`MAX_SCHEDULE_PAGES`, `lib/vlr/jobs/sync-schedule.ts:22`)
seria declarada cancelada por nunca aparecer. E se `vlr.schedule.pages_truncated`
(`sync-schedule.ts:70-72`) disparar, a marcação é **pulada inteira** nesta execução — varredura
incompleta não tem autoridade para declarar nada sumido.

### 3.2 Quem passa a ignorar a sumida

Um `and(..., isNull(match.dismissedAt))` em cada uma destas, todas hoje sem o filtro:

| Arquivo:linha                        | Função                           | Consequência de não filtrar          |
| ------------------------------------ | -------------------------------- | ------------------------------------ |
| `lib/round/queries.ts:108`           | `listUpcomingMatches`            | jogo fantasma no painel da Home      |
| `lib/round/queries.ts:323`           | `listMarketLockMatches`          | mercado travado por jogo inexistente |
| `lib/round/queries.ts:408`           | `listOrganizationMatches`        | região de organização por jogo morto |
| `lib/round/queries.ts:430`           | `organizationLeague`             | idem, no caso pontual                |
| `lib/round/queries.ts:477`           | `listInternationalWindowMatches` | aba internacional aberta à toa       |
| `lib/vlr/jobs/cadence.ts:54`         | `countMatchesInPlay`             | 1 requisição/min por 12h à toa       |
| `lib/vlr/jobs/calculate-round.ts:78` | `runRoundJob`                    | **a rodada nunca fecha**             |
| `lib/vlr/persist/rounds.ts:44`       | `syncRoundsFromMatches`          | `marketClosesAt` de jogo que não há  |
| `lib/vlr/persist/rounds.ts:179`      | `refreshRoundMatchCounts`        | "Partidas pontuadas" nunca completa  |

**Testes:** `markMissingMatches` marca na 1ª ausência e só descarta na 2ª; ressuscita o card que
voltou; **não** toca em partida além do horizonte; **não** roda com varredura truncada. Em
`calculate-round.test.ts`, um caso novo: rodada com uma partida descartada e o resto extraída
**fecha** (era o travamento do fato 6). Em `rounds.test.ts`, `marketClosesAt` ignora o kickoff da
descartada.

**Como verificar:** no `db:studio`, marcar `dismissed_at` à mão numa partida futura e confirmar
que ela some de "Próximos jogos" na Home e deixa de aparecer no fechamento do mercado.

---

## Fase 4 — A releitura tardia (Decisão 5)

**Arquivos**

- **Muda:** `lib/vlr/jobs/scrape-match.ts` (grava `contentHash`; nova `revalidateMatch`)
- **Novo:** `lib/vlr/jobs/revalidate-matches.ts` (o enfileirador) + `.test.ts`
- **Muda:** `lib/vlr/persist/stats.ts` (`saveMatchStats` aceita `contentHash` e `revalidatedAt`)
- **Novo:** `scripts/vlr/revalidate.ts`; **muda:** `package.json` (`vlr:revalidate`)

```ts
/** Relê a partida uma vez. Payload idêntico ao da extração → só carimba a data. */
export async function revalidateMatch(
  vlrId: string,
  store: RawStore = diskRawStore,
): Promise<{ changed: boolean }>;
```

Ordem: `fetchHtml` → `parseMatchDetail` → `fingerprint(detail)`.

- **Digital igual** a `match.contentHash`: grava só `revalidatedAt`. **Nenhum arquivo novo no
  disco, nenhuma escrita de estatística, nenhum reprocessamento** — é o "nada é regravado" da
  Decisão 5.
- **Digital diferente:** `store.put` do HTML novo (o histórico do disco fica com as duas
  versões — o princípio "o HTML bruto é o dado" continua valendo), `persistMatchDetail`, e
  `revalidatedAt` + `contentHash` novos na mesma transação. `player.score` se corrige sozinho no
  próximo `vlr:round`, porque `calculateRound` **atribui**, nunca soma
  (`lib/vlr/jobs/calculate-round.ts:14-18`).

O enfileirador roda de hora em hora e seleciona: evento `tracked`, `scrapedAt` entre 48h e 6h
atrás, `revalidatedAt IS NULL`, `dismissedAt IS NULL`. Fora desse intervalo, o job sai depois de
**uma consulta ao banco**, sem tocar na rede.

**Testes** (rede e banco mockados): digital igual → `saveMatchStats` **não** é chamado e
`store.put` **não** é chamado; digital diferente → os dois são; o enfileirador ignora partida
recém-extraída (< 6h), partida velha (> 48h), já revalidada e descartada.

**Como verificar:** `pnpm vlr:revalidate` logo depois de uma extração não enfileira nada;
alterando `scraped_at` à mão para 7h atrás, ele enfileira uma; rodando `pnpm vlr:work` em
seguida, o log traz `changed: false` e o disco não ganha arquivo novo.

---

## Fase 5 — Elencos: transferência sem esperar o jogador entrar em quadra (Decisão 4)

**Arquivos**

- **Muda:** `lib/vlr/jobs/work.ts` (a fila passa a atender três trabalhos)
- **Novo:** `lib/vlr/jobs/scrape-roster.ts` + `.test.ts`
- **Novo:** `lib/vlr/jobs/sync-rosters.ts` (o enfileirador) + `.test.ts`
- **Novo:** `lib/vlr/persist/rosters.ts` + `.test.ts`
- **Novo:** `scripts/vlr/rosters.ts`; **muda:** `package.json` (`vlr:rosters`)

### 5.1 A fila deixa de ser de um trabalho só

`workQueue` (`lib/vlr/jobs/work.ts:33-73`) hoje chama `scrapeMatch(job.key)` direto. Passa a ter
um registro:

```ts
const HANDLERS: Record<VlrJob, (key: string) => Promise<unknown>> = {
  [VLR_JOBS.scrapeMatch]: (key) => scrapeMatch(key),
  [VLR_JOBS.revalidateMatch]: (key) => revalidateMatch(key),
  [VLR_JOBS.scrapeRoster]: (key) => scrapeRoster(key),
};
```

O laço percorre os três tipos, cada um com seu `claim`. Tudo o mais permanece: transação de
reivindicação, `FOR UPDATE SKIP LOCKED`, backoff, dead letter na 3ª tentativa, e **falha isolada
não derruba o lote**.

### 5.2 O que o elenco escreve

```ts
export async function applyRoster(
  tx: Querier,
  roster: ScrapedTeamRoster,
): Promise<{ updated: number; unknown: number; left: number }>;
```

1. `upsertTeams` com nome/sigla/região (já existe, `lib/vlr/persist/teams.ts:19-56`).
2. Para cada jogador do elenco com `player.vlrId` correspondente: atualiza `team`, `nickname`
   (no mesmo savepoint de `resolvePlayer`, `lib/vlr/persist/players.ts`, para colisão de apelido
   não derrubar o lote), `realName`, `country`, e limpa `rosterMissingSince`.
3. Jogador do elenco **sem** linha em `player`: ignorado, com `logWarn("vlr.roster.unknown_player")`.
   É a Decisão 4 — estreante entra quando jogar, não antes.
4. Jogador cujo `player.team` é esta organização e que **não** está mais no elenco: grava
   `rosterMissingSince` (se ainda nulo). **Não** o desativa e **não** o tira do mercado: ele pode
   estar escalado no time de alguém neste exato momento, e sumir do catálogo no meio da rodada
   quebraria escalação alheia por uma informação que ainda pode ser um erro do vlr.

O enfileirador pega os `vlr_team.vlrId` das organizações que aparecem em partidas de eventos
`tracked` nos últimos 45 e nos próximos 30 dias — tipicamente ~40 a 60 times, ou seja **~1
minuto de fila por dia** ao ritmo de 1,1s.

**Testes:** troca de organização é gravada; jogador ausente do elenco recebe
`rosterMissingSince` e **continua** `active`; jogador de elenco sem registro é ignorado, não
criado; colisão de apelido não aborta a transação; rodar duas vezes não muda nada na segunda.
Em `work.test.ts`: os três tipos de trabalho são reivindicados e uma falha num não impede o
outro.

**Como verificar:** `pnpm vlr:rosters` → `pnpm vlr:work`; conferir no `db:studio` que
`player.team` de alguém que trocou de time bate com a página `/team/...` do vlr, e que
`vlr:regions` (Fase 7) reclassifica a região dele na passada seguinte.

---

## Fase 6 — Saber que parou (Decisões 1 e 7)

**Arquivos**

- **Novo:** `lib/vlr/persist/health.ts` + `.test.ts`
- **Novo:** `lib/vlr/jobs/health.ts` + `.test.ts`
- **Novo:** `scripts/vlr/health.ts`; **muda:** `package.json` (`vlr:health`)
- **Muda:** `scripts/vlr/run.ts` (o invólucro dos onze entrypoints)
- **Muda:** `lib/vlr/jobs/doctor.ts` (o atraso entra no veredito)

### 6.1 O batimento sai de graça, em um lugar só

`runScript` (`scripts/vlr/run.ts:12-27`) já é o invólucro de **todo** script `vlr:*`. Ele passa a
gravar em `vlr_job_health`, no `finally`, antes do `pool.end()`: `lastStatus`,
`lastStartedAt`/`lastFinishedAt`, `lastDurationMs`, o resumo e — em falha — a mensagem e
`consecutiveFailures + 1`. Nenhum script individual muda; um `catch` interno garante que uma
falha ao gravar o batimento não mude o exit code do job.

### 6.2 O veredito

- `pnpm vlr:health` — **sem rede**: lê `vlr_job_health`, roda `staleJobs` (Fase 0) e sai com
  código ≠ 0 se algo está atrasado, nunca rodou, ou falhou nas 3 últimas execuções. É o que o
  `healthcheck` do compose chama.
- `runDoctor` passa a incluir os atrasados no `healthy` (hoje ele só olha seletores,
  `lib/vlr/jobs/doctor.ts:85`) e a relatar três contagens novas: partidas descartadas,
  `roster_missing_since` preenchidos e jogadores esperando revisão (esta já existe, `doctor.ts:86`).

**Testes:** `recordJobRun` grava sucesso e falha, incrementa e zera `consecutiveFailures`;
`runHealth` reprova por atraso, por falha repetida e por job que nunca rodou; `runDoctor` fica
`healthy: false` quando `staleJobs` acusa alguém, mesmo com todos os seletores `ok`.

**Como verificar:** parar o container por 10 minutos, subir de novo e rodar `pnpm vlr:health` —
ele acusa `vlr:results` e `vlr:work` atrasados, por nome.

---

## Fase 7 — O agendador no ar (Decisões 1, 2 e 8)

**Arquivos**

- **Muda:** `deploy/vlr-cron/crontab` (o ritmo novo, 11 linhas)
- **Muda:** `deploy/vlr-cron/docker-compose.yml` (`healthcheck`)
- **Muda:** `lib/vlr/jobs/sync-results.ts` e `lib/vlr/jobs/sync-schedule.ts` (digital da página)
- **Novo:** `lib/vlr/persist/page-state.ts` + `.test.ts`
- **Mudam:** `deploy/vlr-cron/README.md`, `docs/SCRAPING.md`

### 7.1 O ritmo

| Job                     | Antes     | Agora        | Vai à rede quando                                               |
| ----------------------- | --------- | ------------ | --------------------------------------------------------------- |
| `vlr:results`           | \*/5 min  | **1 min**    | só em janela de partida (`isMatchWindow`, já existe)            |
| `vlr:work`              | \*/2 min  | **1 min**    | só com fila não vazia                                           |
| `vlr:round`             | \*/15min  | **5 min**    | nunca (só banco)                                                |
| `vlr:schedule`          | 06:00     | **6 em 6 h** | 2 a 3 requisições por passada (é o que fecha o ciclo da Fase 3) |
| `vlr:revalidate`        | —         | **1 h**      | só com partida na janela de 6-48h                               |
| `vlr:rosters`           | —         | **05:00**    | 1 requisição por time seguido                                   |
| `vlr:regions`           | —         | **05:30**    | nunca                                                           |
| `vlr:activate-reviewed` | —         | **05:40**    | nunca (Decisão 8)                                               |
| `vlr:events`            | dom 03:00 | **03:00**    | 1 requisição/dia (agora liga `tracked` sozinho — Fase 2)        |
| `vlr:results --force`   | 06:30     | 06:30        | varredura de resto                                              |
| `vlr:doctor`            | 07:00     | 07:00        | 5 requisições/dia                                               |

Toda linha mantém o `flock -n` que já está lá (`deploy/vlr-cron/crontab:5-8`) — a proteção contra
uma execução lenta atropelar a seguinte, que fica mais importante ainda a cada minuto.

**A conta do tráfego, para ninguém precisar refazê-la:** dia **sem** jogo — ~2 (schedule) + 1
(events) + ~50 (rosters) + 5 (doctor) ≈ 60 requisições/dia, quase todas às 5 da manhã. Dia **com**
jogo — as mesmas, mais 1/min durante a janela e 1 por partida extraída. Ao rate limit de 1,1s
(`lib/vlr/http/rate-limiter.ts`), nada disso encosta em rajada.

### 7.2 A digital das listas

`syncResults` e `syncSchedule` passam por `lib/vlr/persist/page-state.ts`:

```ts
export async function pageChanged(
  tx: Querier,
  args: { path: string; hash: string; at: Date },
): Promise<boolean>;
```

Depois do parse: `fingerprint(items)`. Se a digital repete a de `vlr_page_state`, o job registra
`vlr.page.unchanged` e **pula upsert, enfileiramento e paginação seguinte**; se muda, segue o
fluxo de hoje. A requisição, essa, aconteceu — pelo motivo já explicado lá em cima.

### 7.3 Subir de verdade (Decisão 1)

`docker-compose.yml` ganha:

```yaml
healthcheck:
  test: ["CMD", "pnpm", "vlr:health"]
  interval: 5m
  timeout: 30s
  retries: 2
  start_period: 10m
```

`restart: unless-stopped` já está lá. **Fica explícito no README:** `healthcheck` marca o
container como `unhealthy` e aparece no `docker ps` — ele **não** reinicia nada sozinho no
compose puro; quem quiser reinício automático precisa de um vigia externo, que este plano não
entrega.

`docs/SCRAPING.md` ganha três blocos: a tabela de cron nova, a seção **"Por que não existe
gatilho"** (com o `curl -sI` e o `no-store` sem `ETag`, para ninguém reabrir a discussão daqui a
seis meses) e o passo a passo de ler o quadro de saúde.

**Como verificar (o aceite da Decisão 1, feito uma vez e olhado no dia seguinte):**

1. `cd deploy/vlr-cron && cp ../../.env.example .env` (preencher) `&& docker compose up -d --build`.
2. `docker compose logs -f vlr-cron` — em ≤ 2 min aparecem as linhas JSON de `vlr:results` e
   `vlr:work`, mesmo que só para dizer "nada a fazer".
3. `docker compose ps` mostra `healthy` depois do `start_period`.
4. No `pnpm db:studio`, `vlr_job_health` tem uma linha por job, com data de minutos atrás.
5. **No dia seguinte, sem tocar em nada:** `vlr_event` tem os campeonatos do circuito `tracked`,
   `player.team` reflete o elenco atual, e nenhuma partida do calendário aponta para jogo que
   não existe.

---

## Riscos e o que fica de fora

**O que este plano deliberadamente não faz:**

- **Não entrega gatilho por mudança no site** — é impossível pelo lado do vlr.gg, com a evidência
  registrada acima. Entrega poll adaptativo com detecção por digital.
- **Não cria tela nenhuma.** Sem componente novo, sem rota nova, portanto **sem teste de React
  Testing Library novo** — a regra do CLAUDE.md continua valendo para componentes, e este plano
  não cria nenhum. Todos os testes aqui são Vitest com **banco mockado** (`vi.hoisted` + `txStub`),
  no padrão de `lib/vlr/jobs/sync-schedule.test.ts:1-50`, e **nenhum faz rede**.
- **Não tira jogador do mercado por ter saído do elenco** — só sinaliza (`rosterMissingSince`).
  Remover quem está escalado no meio da rodada é decisão de produto, e destrutiva.
- **Não cria tela de administração** para o veto de campeonato nem para o jogador ambíguo: os
  dois continuam sendo um clique no `pnpm db:studio`. Não é "rodar comando" — é decisão humana,
  que a Decisão 3 manda preservar.
- **Não avisa por e-mail nem Discord** (Decisão 7) e **não mostra nada na tela do jogo**.
- **Não muda regra de pontuação, preço ou fechamento de rodada.** `calculateRound` e
  `closeActiveRound` seguem intocados.

**O que pode dar errado:**

1. **Marcar como sumida uma partida que existe.** É o risco mais caro (some do calendário e
   destrava mercado que devia estar travado). Mitigado por três travas: só dentro do horizonte
   efetivamente varrido, só com varredura não truncada, e só na 2ª ausência seguida — mais o
   caminho de ressurreição automática. Ainda assim, é o item a olhar na primeira semana.
2. **A regra de "campeonato do circuito" errar o nome.** O vlr renomeia eventos entre
   temporadas; um nome fora do padrão deixa o campeonato de fora em silêncio. Mitigação: o
   `doctor` diário passa a contar eventos `ongoing` **não** seguidos com partidas nos próximos 7
   dias — o número que denuncia isso. Conserto: um clique em `tracked_override`.
3. **Bloqueio de IP pelo vlr.gg.** O ritmo de 1 min em janela de partida é ~3× o de hoje. O rate
   limiter e o User-Agent identificável continuam de pé, e a conta do §7.1 mostra que o volume
   diário mal muda fora de dia de jogo — mas se o vlr responder 429 com frequência, a resposta
   certa é afrouxar a janela, não driblar o bloqueio.
4. **A digital não repetir nunca**, tornando a otimização inócua. É por isso que ela é do payload
   interpretado, e não do HTML; se ainda assim variar a cada leitura, o custo é o de hoje
   (nenhuma economia), nunca um erro de dado.
5. **Máquina que hospeda o container cair.** Nada aqui recupera sozinho a máquina; o batimento é
   o que torna a queda visível em vez de silenciosa, que é exatamente o que a Decisão 7 pediu.
6. **A releitura tardia trazer HTML de página de erro** e sobrescrever dado bom. Mitigado por
   `parseMatchDetail` + Zod (`lib/vlr/schemas.ts:48-81`): payload que não valida lança antes de
   qualquer escrita, e a partida cai na dead letter queue depois de 3 tentativas.
