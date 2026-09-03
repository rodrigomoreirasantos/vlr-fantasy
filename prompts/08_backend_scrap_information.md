## 1. Contexto do projeto

Contruir o backend de um jogo de fantasy sports para o cenário competitivo de Valorant. Usuários montam escalações com jogadores profissionais reais antes de cada rodada da VCT e pontuam de acordo com o desempenho real desses jogadores nas partidas.

**A fonte de dados é o site vlr.gg via scraping de HTML.** Isso não é uma escolha por preferência — o vlr.gg não expõe API pública nem endpoint JSON interno. O site é renderizado no servidor, então o HTML da resposta já contém todos os dados. A comunidade do próprio vlr confirma em thread pública que não existe `robots.txt` nem termos de serviço no site, com o pedido de bom senso de limitar a aproximadamente 1 requisição por segundo.

**Custo alvo: zero.** Nenhuma dependência paga, nenhuma API com plano comercial, nenhum serviço de scraping gerenciado.

---

## 2. Regras invioláveis

Estas regras valem para todas as fases. Se alguma tarefa parecer exigir violá-las, pare e pergunte.

1. **Nunca usar navegador headless** (Puppeteer, Playwright, Selenium). O vlr.gg é SSR — `axios` + `cheerio` resolve tudo. Headless browser é lento, pesado e desnecessário aqui.
2. **Rate limit de 1 requisição por segundo, sempre.** Implementado numa camada central que todo scraper obrigatoriamente atravessa. Nenhum módulo faz `axios.get` direto.
3. **User-Agent identificável** em toda requisição, com e-mail de contato. Nunca falsificar user-agent de navegador.
4. **Sempre persistir o HTML bruto antes de parsear.** Quando o layout do vlr mudar e o parser quebrar, reprocessamos do arquivo salvo sem perder histórico e sem re-scrapear.
5. **Nunca pontuar direto do scraper.** O fluxo é: scraping → snapshot persistido → job de pontuação lê do banco. Pontuação nunca depende de uma requisição HTTP em tempo real.
6. **Todo parser precisa de teste com fixture de HTML salvo.** Nenhum teste faz requisição de rede.
7. **Cache permanente para partidas finalizadas.** Uma série já encerrada nunca muda; se já está no banco, não requisita de novo.
8. **Escalação trava antes do primeiro jogo da rodada.** Regra de negócio central do fantasy — sem isso o jogo é trapaceável.

---

## 3. Stack técnica

| Camada        | Escolha             | Motivo                                               |
| ------------- | ------------------- | ---------------------------------------------------- |
| Runtime       | Node.js 20+         | Requisito do projeto                                 |
| Linguagem     | TypeScript (strict) | Parser de HTML sem tipagem vira bug silencioso       |
| HTTP client   | axios               | Interceptors facilitam a camada de rate limit        |
| Parser HTML   | cheerio             | Seletores CSS sobre o HTML, sem browser              |
| Framework API | Fastify             | Mais rápido que Express, validação com schema nativa |
| Banco         | PostgreSQL          | Relacional, agregações fortes para stats             |
| ORM           | Prisma              | Migrations versionadas, tipos gerados                |
| Filas/Jobs    | BullMQ + Redis      | Retry automático, jobs idempotentes                  |
| Validação     | Zod                 | Valida o output do scraper antes de persistir        |
| Logs          | Pino                | Estruturado, JSON                                    |
| Testes        | Vitest              | Rápido, suporte nativo a TS                          |
| Containers    | Docker Compose      | Postgres + Redis local sem instalar nada             |

Tudo open source e gratuito.

---

## 4. Estrutura de pastas

Monte uma estrutura de pasta que seja bem feita e facil de entender e organizar com base no que ja tenho no projeto.

**Ponto crítico de arquitetura:** `selectors.ts` centraliza todo seletor CSS num único arquivo. Quando o vlr mudar o HTML, corrigimos um arquivo em vez de caçar strings espalhadas por dez módulos.

---

## 5. Modelo de dados

ex.

```drizzle
model Team {
  id          String   @id @default(cuid())
  vlrId       String   @unique      // id numérico do vlr.gg
  name        String
  tag         String?
  region      String?
  logoUrl     String?
  players     Player[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Player {
  id          String   @id @default(cuid())
  vlrId       String   @unique
  nickname    String
  realName    String?
  country     String?
  teamId      String?
  team        Team?    @relation(fields: [teamId], references: [id])
  role        String?                // duelist, controller, etc (manual)

  // economia do fantasy
  price       Decimal  @db.Decimal(10,2) @default(5.00)
  averageScore Decimal @db.Decimal(10,2) @default(0)
  gamesPlayed Int      @default(0)

  stats       PlayerMatchStat[]
  lineups     LineupSlot[]
}

model Event {
  id          String   @id @default(cuid())
  vlrId       String   @unique
  name        String
  region      String?
  startDate   DateTime?
  endDate     DateTime?
  matches     Match[]
}

model Match {
  id          String   @id @default(cuid())
  vlrId       String   @unique
  eventId     String?
  event       Event?   @relation(fields: [eventId], references: [id])
  team1Name   String
  team2Name   String
  team1Score  Int?
  team2Score  Int?
  scheduledAt DateTime
  status      MatchStatus @default(UPCOMING)
  roundId     String?
  round       Round?   @relation(fields: [roundId], references: [id])
  scrapedAt   DateTime?
  rawHtmlPath String?
  stats       PlayerMatchStat[]
}

enum MatchStatus {
  UPCOMING
  LIVE
  FINISHED
  SCRAPED       // finalizada E stats já extraídos
}

model PlayerMatchStat {
  id          String   @id @default(cuid())
  matchId     String
  match       Match    @relation(fields: [matchId], references: [id])
  playerId    String
  player      Player   @relation(fields: [playerId], references: [id])

  mapName     String                  // "all" para agregado da série
  agent       String?

  rating      Decimal? @db.Decimal(5,2)
  acs         Int?
  kills       Int?
  deaths      Int?
  assists     Int?
  kast        Int?                    // percentual
  adr         Int?
  headshotPct Int?
  firstKills  Int?
  firstDeaths Int?

  fantasyPoints Decimal @db.Decimal(10,2) @default(0)

  @@unique([matchId, playerId, mapName])
}

model Round {
  id          String   @id @default(cuid())
  number      Int      @unique
  name        String
  opensAt     DateTime
  closesAt    DateTime               // trava de escalação
  status      RoundStatus @default(OPEN)
  matches     Match[]
  lineups     Lineup[]
}

enum RoundStatus {
  SCHEDULED
  OPEN
  CLOSED
  CALCULATING
  FINISHED
}

model User {
  id          String   @id @default(cuid())
  email       String   @unique
  passwordHash String
  username    String   @unique
  budget      Decimal  @db.Decimal(10,2) @default(100.00)
  lineups     Lineup[]
  createdAt   DateTime @default(now())
}

model Lineup {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  roundId     String
  round       Round    @relation(fields: [roundId], references: [id])
  slots       LineupSlot[]
  totalPoints Decimal  @db.Decimal(10,2) @default(0)
  submittedAt DateTime @default(now())

  @@unique([userId, roundId])
}

model LineupSlot {
  id          String   @id @default(cuid())
  lineupId    String
  lineup      Lineup   @relation(fields: [lineupId], references: [id])
  playerId    String
  player      Player   @relation(fields: [playerId], references: [id])
  isCaptain   Boolean  @default(false)
  pricePaid   Decimal  @db.Decimal(10,2)
  pointsEarned Decimal @db.Decimal(10,2) @default(0)

  @@unique([lineupId, playerId])
}
```

---

## 6. Fases de execução

### Fase 0 — Fundação

**Objetivo:** projeto rodando, banco de pé, nenhuma linha de scraping ainda.

Tarefas:

1. `npm init`, TypeScript strict, ESLint + Prettier, scripts `dev`/`build`/`test`
2. `docker-compose.yml` com Postgres 16 e Redis 7
3. Drizzzle inicializado com o schema da seção 5, primeira migration aplicada
4. `src/config/env.ts` validando env vars com Zod (`DATABASE_URL`, `REDIS_URL`, `VLR_USER_AGENT`, `VLR_CONTACT_EMAIL`, `PORT`, `JWT_SECRET`)
5. Logger Pino configurado
6. Fastify subindo com rota `GET /health` retornando status do Postgres e do Redis
7. `.env.example` documentado

**Critério de aceite:** `docker compose up -d && npm run dev` sobe, e `curl localhost:3000/health` retorna 200 com ambos conectados.

**Não faça nesta fase:** nenhum código de scraper, nenhuma rota de negócio.

---

### Fase 1 — Camada HTTP e rate limiting

**Objetivo:** o único portão de saída para o vlr.gg, com as regras de boa conduta embutidas por construção.

Tarefas:

1. `rateLimiter.ts` — fila serial garantindo intervalo mínimo de 1100ms entre requisições. Precisa ser um singleton compartilhado por todo o processo.
2. `vlrClient.ts` — instância axios com:
   - `baseURL: https://www.vlr.gg`
   - Header `User-Agent` montado a partir das env vars (`ValorantFantasy/1.0 (+email)`)
   - Interceptor que passa toda request pelo rate limiter
   - Retry com backoff exponencial em 429/503 (3 tentativas)
   - Timeout de 15s
   - Log estruturado de cada request (url, status, duração)
3. `rawHtmlStore.ts` — grava HTML em `storage/raw/{tipo}/{id}/{timestamp}.html`, retorna o path. Interface preparada para trocar disco por S3 depois sem mudar chamadas.
4. Testes do rate limiter validando que 3 chamadas concorrentes levam pelo menos 2.2s.

**Critério de aceite:** script que dispara 5 requisições e prova nos logs o espaçamento de ~1s entre elas.

---

### Fase 2 — Scrapers

**Objetivo:** extrair dados reais do vlr.gg de forma resiliente.

> **⚠️ Instrução obrigatória para o Claude Code nesta fase:** os seletores CSS listados abaixo são um ponto de partida baseado no layout conhecido do vlr.gg, **não uma referência confiável**. O markup do site muda periodicamente. Antes de implementar cada scraper: baixe a página real, salve como fixture em `src/tests/fixtures/`, inspecione a estrutura HTML de verdade e ajuste os seletores conforme o que encontrar. Se um seletor não bater, corrija-o em `selectors.ts` e me avise do que mudou — não invente fallback silencioso.

#### 2.1 — `upcomingMatches.ts`

- URL: `/matches`
- Seletores base: `a.wf-module-item.match-item`, com `.match-item-vs-team-name`, `.match-item-time`, `.match-item-event`
- Extrai: vlrId (do href), times, horário agendado, evento

#### 2.2 — `matchResults.ts`

- URL: `/matches/results?page=N`
- Mesma estrutura de card, mas com `.match-item-vs-team-score` preenchido
- Precisa suportar paginação com parada configurável (ex: parar ao encontrar N partidas já existentes no banco)

#### 2.3 — `matchDetail.ts` — **o mais importante**

- URL: `/{vlrId}/?game=all&tab=overview`
- Tabela: `.wf-table-inset.mod-overview`, cada `<tr>` é um jogador
- **Armadilha central:** cada célula de stat contém três valores — total, ataque e defesa — em spans distintos com as classes `.mod-both`, `.mod-t` e `.mod-ct`. Pegar o texto da célula inteira concatena os três e produz número lixo. Extraia sempre `.mod-both` explicitamente.
- Extrai por jogador: nickname, time, agente, rating, ACS, K, D, A, KAST, ADR, HS%, FK, FD
- Também parsear os mapas individuais, não só o agregado

#### 2.4 — `playerProfile.ts` e `teamRoster.ts`

- URLs: `/player/{id}/{slug}` e `/team/{id}/{slug}`
- Extrai identidade do jogador, país, time atual, e o elenco do time

#### 2.5 — `eventList.ts`

- URL: `/events`
- Extrai eventos em andamento e futuros com região e datas

**Para cada scraper, obrigatoriamente:**

- Schema Zod validando o output antes de retornar
- Fixture de HTML real salvo em `src/tests/fixtures/`
- Teste unitário que roda contra o fixture, sem rede
- Erro explícito e logado quando um seletor não encontra nada (nunca retornar array vazio silenciosamente)

**Critério de aceite:** `npm test` passa, e um script manual consegue puxar uma partida real e imprimir os 10 jogadores com stats coerentes.

---

### Fase 3 — Normalização e persistência

**Objetivo:** transformar output de scraper em entidades do domínio, de forma idempotente.

Tarefas:

1. Normalizers convertendo cada saída de scraper em entidade Prisma
2. **Resolução de identidade** — o desafio real: o scoreboard traz o nickname, não o vlrId do jogador. Estratégia:
   - Match por nickname + time dentro do elenco conhecido
   - Se não encontrar, criar registro `Player` provisório com flag `needsReview`
   - Nunca duplicar jogador silenciosamente
3. Toda escrita usa `upsert` com chave natural (`vlrId`) — rodar o job duas vezes não pode duplicar nada
4. Ao persistir stats, gravar `rawHtmlPath` e `scrapedAt` na Match e mover status para `SCRAPED`
5. Comando CLI `npm run backfill -- --pages=20` para carga histórica inicial

**Critério de aceite:** rodar o backfill duas vezes seguidas resulta em contagem idêntica de registros no banco.

---

### Fase 4 — Motor de pontuação

**Objetivo:** converter stats reais em pontos de fantasy.

#### Tabela de scouts sugerida (`scoutRules.ts` — deixar configurável, não hardcoded)

| Evento                | Pontos             |
| --------------------- | ------------------ |
| Kill                  | +2.0               |
| Death                 | -1.0               |
| Assist                | +0.5               |
| First Kill            | +1.5               |
| First Death           | -1.0               |
| ACS acima de 250      | +3.0               |
| ACS acima de 200      | +1.5               |
| KAST acima de 75%     | +2.0               |
| ADR acima de 150      | +2.0               |
| Rating acima de 1.20  | +3.0               |
| Rating abaixo de 0.80 | -2.0               |
| Vitória do mapa       | +2.0               |
| Capitão               | multiplicador 1.5x |

Requisitos do motor:

- Pontuação calculada **por mapa** e somada na série (evita que jogador de série 3-0 seja penalizado vs. série 3-2)
- Regras versionadas: cada `PlayerMatchStat` guarda a versão de regra usada no cálculo
- Idempotente — recalcular a mesma rodada produz o mesmo resultado
- Testes com casos conhecidos (performance excelente, mediana, ruim)

#### Valorização (`valuation.ts`)

Modelo Cartola: o preço sobe ou desce conforme o jogador supera ou fica abaixo da própria média.

```
novoPreco = precoAtual + ((pontosRodada - mediaJogador) * fatorValorizacao)
```

Com piso e teto configuráveis, e fator de amortecimento nas primeiras rodadas (amostra pequena não pode mover preço agressivamente).

**Critério de aceite:** dado um scoreboard real de partida, o motor produz pontuações plausíveis e o teste de idempotência passa.

---

### Fase 5 — Jobs e agendamento

**Objetivo:** o pipeline rodando sozinho.

| Job                 | Frequência                                                   | O que faz                                                                |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `syncSchedule`      | Diário, 06:00                                                | Puxa `/matches` e `/events`, cria/atualiza Round e Match                 |
| `syncResults`       | A cada 15min                                                 | Puxa `/matches/results`, detecta partidas `FINISHED` ainda não `SCRAPED` |
| `scrapeMatchDetail` | Sob demanda, enfileirado pelo `syncResults`                  | Um job por partida — falha isolada não derruba o lote                    |
| `calculateRound`    | Disparado quando todas as partidas da rodada estão `SCRAPED` | Pontua lineups, aplica valorização, fecha a rodada                       |
| `closeRound`        | Cron no `closesAt`                                           | Trava escalações                                                         |

Requisitos:

- BullMQ com retry (3 tentativas, backoff exponencial)
- Todo job idempotente
- Dead letter queue para falhas persistentes
- Log estruturado de início/fim/duração

**Critério de aceite:** simular partida finalizada e ver o pipeline completo rodar até a pontuação sem intervenção manual.

---

### Fase 6 — API REST

**Objetivo:** expor o jogo.

```
POST   /auth/register
POST   /auth/login
GET    /auth/me

GET    /players                    # filtros: team, region, minPrice, maxPrice, search
GET    /players/:id
GET    /players/:id/stats          # histórico por rodada

GET    /rounds/current
GET    /rounds/:id
GET    /rounds/:id/matches

POST   /lineups                    # cria/atualiza escalação da rodada aberta
GET    /lineups/me
GET    /lineups/me/:roundId

GET    /leaderboard                # ranking geral
GET    /leaderboard/round/:roundId
```

Regras de negócio obrigatórias em `POST /lineups`:

- Recusar se `round.status !== OPEN` (retornar 422 com mensagem clara)
- Validar soma dos preços contra o `budget` do usuário
- Validar exatamente 5 jogadores, exatamente 1 capitão
- Não permitir jogadores duplicados
- Registrar `pricePaid` no momento da escalação (preço congela na escalação — se o jogador valoriza depois, não retroage)

Requisitos técnicos: JWT, validação com schema Zod/Fastify, rate limit por IP, paginação em todas as listas, tratamento de erro centralizado com formato consistente.

---

### Fase 7 — Observabilidade e resiliência

1. **Health check de scraper:** job diário valida seletores contra páginas reais e alerta se algum parou de bater. Isso é o que impede descobrir que o parser quebrou só quando um usuário reclama de pontuação errada.
2. Métricas: taxa de sucesso de scraping, duração de jobs, contagem de `needsReview`
3. Endpoint admin para reprocessar partida a partir do HTML bruto salvo
4. Documentação: README com setup, e `docs/SCRAPING.md` explicando a estrutura do vlr e como corrigir seletores quebrados

---

## 7. Instruções de trabalho para o Claude Code

Crie um `CLAUDE.md` na raiz com este conteúdo:

```markdown
# Regras deste repositório

## Fluxo

- Execute UMA fase por vez, na ordem do PLANO.md
- Ao final de cada fase, rode os testes e pare para revisão
- Commit por fase, mensagem descritiva

## Código

- TypeScript strict, sem `any`
- Nenhuma requisição HTTP fora de `vlrClient.ts`
- Todo seletor CSS mora em `scrapers/selectors.ts`
- Todo output de scraper valida com Zod antes de persistir
- Nenhum teste faz rede — apenas fixtures

## Scraping

- Rate limit de 1 req/s é inviolável
- Sempre salvar HTML bruto antes de parsear
- Seletor que não encontra nada = erro logado, nunca array vazio silencioso
- Se um seletor do plano não bater com o HTML real, corrija e me informe

## Nunca faça

- Navegador headless
- Pontuar direto do scraper sem passar pelo banco
- Re-scrapear partida já marcada como SCRAPED
- Hardcode de regra de pontuação fora de scoutRules.ts
```

---

## 8. Riscos conhecidos

| Risco                                  | Mitigação                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| vlr.gg muda o HTML e quebra o parser   | Seletores centralizados + health check diário + HTML bruto salvo para reprocessar |
| Jogador não identificado no scoreboard | Flag `needsReview` + endpoint admin de resolução manual                           |
| Bloqueio por excesso de requisições    | 1 req/s, User-Agent identificável, cache de partidas finalizadas                  |
| Correção retroativa de stats pelo vlr  | Snapshot versionado; decisão explícita sobre recalcular ou congelar               |
| Aspecto legal para uso comercial       | Contatar o staff do vlr.gg pelo Discord antes de lançar publicamente              |

---

## 9. Ordem de execução resumida

```
Fase 0  →  Fundação (projeto + banco + health)
Fase 1  →  Camada HTTP com rate limit
Fase 2  →  Scrapers + fixtures + testes
Fase 3  →  Normalização e persistência idempotente
Fase 4  →  Motor de pontuação e valorização
Fase 5  →  Jobs e agendamento
Fase 6  →  API REST
Fase 7  →  Observabilidade
```

Fases 0 a 3 entregam um pipeline de dados funcional. Fases 4 a 6 transformam isso em jogo. A Fase 7 é o que mantém tudo vivo depois do lançamento.
