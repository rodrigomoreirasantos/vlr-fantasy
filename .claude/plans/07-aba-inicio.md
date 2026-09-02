# Aba Início — o resumo da rodada, do mercado e do calendário

## Context

`prompts/07_home_tab.md` pede a tela que o header já reserva mas nunca teve rota: **"Início"** é o
primeiro item de `SECTIONS` (`components/layout/app-header.tsx:28`) e continua um `<span>` inerte por
falta de `href`. Ela deve ser o resumo rápido de tudo — resultado da rodada fechada, próxima rodada,
destaques e convites pendentes.

O que existe hoje e condiciona o desenho:

1. **Não há histórico de nada.** `player.score` é _"pontuação acumulada na rodada corrente"_
   (`db/schema/players.ts:37`) — uma coluna mutável, sobrescrita quando a rodada vira. `player.priceCents`
   idem. `fantasyTeam.balanceCents` idem. A única tabela histórica do schema é `transfer`, e ela só
   registra movimentação de mercado.
2. **Nada no código escreve `player.priceCents`.** Preços nascem no `db/seed.ts` e nunca mudam. Sem
   repreçificação, "valorizações e desvalorizações" e "variação de patrimônio" são sempre zero.
3. **Não existe tabela de partidas.** `round.totalMatches` / `round.scoredMatches` são dois inteiros
   soltos — não há adversário, data, evento nem placar.
4. **Não existe disponibilidade de jogador.** Só `player.active` (booleano de catálogo, que filtra o
   mercado). Nada distingue banco de lesão de time eliminado.
5. **Nada fecha uma rodada.** O seed cria uma única "Rodada 1" ativa. Não há admin, cron ou script.
6. **A braçadeira de capitão não faz nada.** `roster_slot.captain` tem índice único, UI e Server Action
   — mas nenhuma conta multiplica por ela.
7. **Existe muito a reaproveitar:** `<Panel>`, `<PendingInvites>` (drop-in completo, some sozinho quando
   vazio), `<ScorerHighlight>` (com estado vazio embutido), `<ChampionshipPlacements>`, `<PlayerIdentity>`,
   `formatScore`, `formatCredits` / `formatCreditsDelta`, `formatTimeLeft` / `formatClosesAt` (esta última
   exportada e **sem nenhum uso hoje**), `rankStandings`, `getStandingRowsByChampionship`,
   `listPendingInvites` e a memoização por request de `getTeamOverview`.

**Resultado pretendido:** `/home` vira o pouso do login e mostra, numa coluna que segue a ordem do
tempo — o que aconteceu na rodada fechada (pontos do time, variação de patrimônio, colocação em cada
campeonato com a variação), o que vem na próxima (contagem regressiva do mercado, alertas dos seus 5,
calendário oficial) e os destaques da rodada (maior pontuador do jogo, maiores valorizações e
desvalorizações). Convites pendentes no topo.

### Decisões de produto (confirmadas na entrevista)

| Pergunta                    | Decisão                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Histórico                   | **Completo** — `round_player_score` + `round_team_result` + `round_roster` congelam cada rodada                |
| Motor de preço              | **Sim** — `lib/scoring/pricing.ts`, pontos acima/abaixo da média movem o preço; a camada que o CLAUDE.md exige |
| Calendário                  | **Tabela `match`** ligada à rodada; vínculo com o jogador via `player.team` (nome da organização)              |
| Indisponibilidade           | **Coluna `player.availability`** (enum) + `availability_note` em pt-BR                                         |
| Virada de rodada            | **Script `pnpm db:round:close`** — sem admin, sem cron                                                         |
| Patrimônio                  | **Saldo + valor do elenco**, com a escalação congelada em `round_roster`                                       |
| Capitão                     | **Dobra os pontos (×2)** — e passa a valer também no ranking e no header                                       |
| Partidas exibidas           | **Todas as da rodada**, com destaque nas que envolvem algum dos seus 5                                         |
| Destaque "maior pontuador"  | **O jogador de Valorant** com mais pontos na rodada, em todo o jogo                                            |
| Colocação na rodada fechada | **Do snapshot**, com a variação em relação à rodada anterior (`↑1` / `↓2` / `—`)                               |
| Rota                        | **`/home`**, e vira o destino do login (5 redirects hoje apontam para `/my-team`)                              |
| Layout                      | **Fluxo temporal, uma coluna** — convites · o que aconteceu · o que vem · destaques                            |

### Fora de escopo (explícito)

- **Stats de partida** (kills, ACS, clutches…). `player.score` continua sendo o ponto de entrada da
  pontuação; `lib/scoring/` nasce com a metade `pontos → preço`. A metade `stats → pontos` fica para a
  fatia seguinte, e o lugar dela já estará pronto.
- **UI de administração** — rodadas, partidas e disponibilidade são semeadas/viradas pelo terminal.
- Placar ao vivo, atualização automática da página, notificação push.
- Histórico navegável ("ver rodada 2") — a Home mostra **a última** rodada fechada, não uma série.
- Gráfico de evolução de patrimônio ou de colocação.

---

## Princípio norteador

**Fechar a rodada é o único momento em que o passado vira dado.** Uma função — `closeActiveRound(tx)` —
congela os três snapshots, reprecifica o catálogo, zera os scores e promove a próxima rodada, tudo numa
transação. Ela tem **dois consumidores**: o script `pnpm db:round:close` e o `db/seed.ts` (que a chama
uma vez para o ambiente de desenvolvimento nascer com uma rodada fechada de verdade). Nenhuma regra é
escrita duas vezes, e o seed deixa de ser um lugar onde números são inventados à mão.

O mesmo espírito dos planos 03 e 06: **regra pura, separada da query.** `teamPoints`, `priceDelta`,
`patrimonyCents`, `placementChanges` e `lineupAlerts` são funções puras, testáveis em milissegundos, sem
tocar banco nem React.

---

## 1. Schema

### 1.1 `db/schema/matches.ts` (novo)

```ts
export const MATCH_STATUSES = ["upcoming", "live", "finished"] as const;
export const matchStatus = pgEnum("match_status", MATCH_STATUSES);

export const match = pgTable(
  "match",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "cascade" }),
    // Texto, não FK: `player.team` também é o nome solto da organização
    // ("FNATIC"). Normalizar as duas pontas de uma vez é uma refatoração
    // maior do que esta fatia — o cruzamento é por igualdade de texto.
    teamA: text("team_a").notNull(),
    teamB: text("team_b").notNull(),
    event: text("event").notNull(), // "VCT Americas"
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: matchStatus("status").notNull().default("upcoming"),
    scoreA: integer("score_a"),
    scoreB: integer("score_b"),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("match_round_scheduled_idx").on(t.roundId, t.scheduledAt),
    check("match_distinct_orgs", sql`${t.teamA} <> ${t.teamB}`),
    // Placar é par: ou os dois lados existem, ou nenhum.
    check(
      "match_score_pairing",
      sql`(${t.scoreA} IS NULL) = (${t.scoreB} IS NULL)`,
    ),
  ],
);
```

### 1.2 `db/schema/round-results.ts` (novo) — os três snapshots

```ts
export const roundPlayerScore = pgTable(
  "round_player_score",
  {
    roundId: uuid("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id, { onDelete: "cascade" }),
    points: numeric("points", {
      precision: 6,
      scale: 1,
      mode: "number",
    }).notNull(),
    priceBeforeCents: integer("price_before_cents").notNull(),
    priceAfterCents: integer("price_after_cents").notNull(),
    // Denormalizado de propósito: é a chave de ordenação dos destaques
    // ("maiores valorizações"), e um índice por expressão sobre a subtração
    // custaria `sql` cru no schema.
    priceDeltaCents: integer("price_delta_cents").notNull(),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.playerId] }),
    index("round_player_score_points_idx").on(t.roundId, t.points.desc()),
    index("round_player_score_delta_idx").on(
      t.roundId,
      t.priceDeltaCents.desc(),
    ),
    check(
      "round_player_score_delta_consistent",
      sql`${t.priceDeltaCents} = ${t.priceAfterCents} - ${t.priceBeforeCents}`,
    ),
  ],
);

export const roundTeamResult = pgTable(
  "round_team_result",
  {
    roundId: uuid("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "cascade" }),
    fantasyTeamId: uuid("fantasy_team_id")
      .notNull()
      .references(() => fantasyTeam.id, { onDelete: "cascade" }),
    /** Total **já com o multiplicador de capitão** — é o número que a Home e a classificação leem. */
    points: numeric("points", {
      precision: 8,
      scale: 1,
      mode: "number",
    }).notNull(),
    balanceCents: integer("balance_cents").notNull(),
    /** Soma dos preços das 5 vagas **antes** da repreçificação: o valor do elenco durante a rodada. */
    squadValueCents: integer("squad_value_cents").notNull(),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.fantasyTeamId] }),
    index("round_team_result_points_idx").on(t.roundId, t.points.desc()),
    index("round_team_result_team_idx").on(t.fantasyTeamId),
  ],
);

export const roundRoster = pgTable(
  "round_roster",
  {
    roundId,
    fantasyTeamId, // mesmas FKs acima
    position: integer("position").notNull(),
    /** `null` = a vaga estava vazia na virada. */
    playerId: uuid("player_id").references(() => player.id, {
      onDelete: "set null",
    }),
    captain: boolean("captain").notNull().default(false),
    /** Pontos **brutos** do jogador. O ×2 do capitão é aplicado por `teamPoints`, nunca gravado aqui. */
    points: numeric("points", { precision: 6, scale: 1, mode: "number" })
      .notNull()
      .default(0),
    priceCents: integer("price_cents").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.fantasyTeamId, t.position] }),
    check("round_roster_position_range", sql`${t.position} BETWEEN 1 AND 5`),
  ],
);
```

**Por que chave primária composta e não `uuid` + índice único:** essas três tabelas nunca são
referenciadas por FK — só lidas por `(rodada, alguém)`. A PK composta é a própria chave de acesso,
economiza um índice e torna a repetição impossível por construção.

### 1.3 `db/schema/players.ts` — disponibilidade

```ts
export const PLAYER_AVAILABILITIES = ["available", "bench", "injured", "eliminated", "doubtful"] as const;
export const playerAvailability = pgEnum("player_availability", PLAYER_AVAILABILITIES);

// dentro de `player`:
availability: playerAvailability("availability").notNull().default("available"),
/** Detalhe opcional em pt-BR, ex. "Fora por lesão no pulso". */
availabilityNote: text("availability_note"),
```

Enum aqui (e `text` no brasão) porque esta lista é **fechada** — são estados do jogo, não um catálogo
que cresce. `active` continua sendo outra coisa: quem sai do catálogo do mercado.

`PLAYER_AVAILABILITIES` vive em `lib/team/types.ts`, ao lado de `PLAYER_ROLES`, e o schema importa de
lá — o mesmo import unidirecional que `playerRole` já usa (`db/schema/players.ts:16-21`).

### 1.4 Barrel e relations

Export em `db/schema/index.ts`; `matchRelations`, `roundPlayerScoreRelations`,
`roundTeamResultRelations`, `roundRosterRelations` em `db/schema/relations.ts` (nunca no arquivo da
tabela), e `roundRelations` (`relations.ts:42`) ganha `matches`, `playerScores`, `teamResults`.

### 1.5 Migration

Um único `pnpm db:generate` cobre tudo: 4 tabelas, 2 enums, 2 colunas em `player`. **Não editar o SQL
gerado.** Nenhuma migration custom desta vez.

---

## 2. `lib/scoring/` (novo) — a camada que o CLAUDE.md exige

Hoje só existe `lib/team/score.ts`, que é apresentação (`scoreTone`, `formatScore`) e traz um TODO
explícito apontando para este diretório (`lib/team/score.ts:11`).

### 2.1 `lib/scoring/team.ts`

```ts
/** A braçadeira dobra a pontuação do jogador. Constante única — o SQL da classificação a interpola. */
export const CAPTAIN_MULTIPLIER = 2;

export function playerContribution(score: number, captain: boolean): number;
export function teamPoints(
  slots: readonly { player: { score: number } | null; captain: boolean }[],
): number;
```

`teamPoints` substitui **os dois** lugares que somam pontos hoje:

- o `reduce` solto em `lib/team/queries.ts:65-68` (header e `/my-team`);
- o `sum(player.score)` de `getStandingRowsByChampionship` (`lib/championship/queries.ts:115`), que vira
  uma expressão Drizzle com a constante interpolada — uma fonte de verdade só:

  ```ts
  points: sql<number>`sum(case when ${rosterSlot.captain}
    then ${player.score} * ${CAPTAIN_MULTIPLIER} else ${player.score} end)`,
  ```

  Isso é `sql` template do Drizzle dentro de um `select`, não SQL cru — a regra do CLAUDE.md proíbe
  escrever query fora do Drizzle, não usar o template dele.

> **Consequência a comunicar:** ligar o capitão muda a pontuação de todo mundo que já tem time. É
> mudança de regra do jogo, deliberada, e o passo 4 da ordem de execução isola essa alteração para a
> suíte pegar qualquer regressão.

### 2.2 `lib/scoring/pricing.ts`

```ts
/** Cada ponto acima (ou abaixo) da média da rodada move o preço em 2.0 créditos. */
export const PRICE_PER_POINT_CENTS = 200;
/** Teto de variação por rodada: 15% do preço — ninguém dobra nem some numa rodada só. */
export const MAX_SWING_RATIO = 0.15;
/** Piso de 10.0 créditos: `player_price_cents_positive` exige `> 0`. */
export const MIN_PRICE_CENTS = 1_000;

export function averagePoints(scores: readonly number[]): number;
export function priceDeltaCents(args: {
  priceCents: number;
  points: number;
  averagePoints: number;
}): number;
export function nextPriceCents(args: {
  priceCents;
  points;
  averagePoints;
}): number;
```

Puras, sem banco, sem data. `priceDeltaCents` já devolve o valor **depois** do teto e do piso, para que
`nextPriceCents(x) - x === priceDeltaCents(x)` sempre — é o que mantém o `CHECK`
`round_player_score_delta_consistent` verdadeiro por construção.

---

## 3. Fechar a rodada — `db/close-round.ts` (novo)

```ts
/** Idempotente por construção: sem rodada `active`, não faz nada e devolve `null`. */
export async function closeActiveRound(
  tx: Querier,
): Promise<{ closedRoundId: string; nextRoundId: string } | null>;
```

Tudo numa transação, nesta ordem:

1. `getActiveRound(tx)` → sem rodada ativa, devolve `null`.
2. Lê o catálogo, calcula `averagePoints`, e para cada jogador `nextPriceCents`.
3. Insere `round_player_score` (um `insert().values([...])` só) com pontos e os três valores de preço.
4. Lê todos os `fantasy_team` com as 5 vagas e os jogadores; insere `round_roster` (5 linhas por time) e
   `round_team_result` — `points: teamPoints(slots)`, `balanceCents`, `squadValueCents` somado com os
   preços **de antes**.
5. `update player set price_cents = <novo>, score = 0`.
6. `update round set status = 'finished'` na ativa — **antes** de promover a próxima, porque
   `round_single_active_uidx` só admite uma linha `active`.
7. Promove a `upcoming` de menor `number` para `active`. Se não houver nenhuma, cria a rodada
   `number + 1` com uma janela de mercado padrão de 3 dias — assim o jogo nunca fica sem mercado.

`package.json`: `"db:round:close": "tsx db/close-round.ts"`, ao lado de `db:seed`. O arquivo exporta a
função e só executa quando chamado direto pelo `tsx` — é o que permite o seed importá-la.

---

## 4. Leitura — `lib/round/` e `lib/home/` (novos)

### 4.1 `lib/round/queries.ts` — primitivas nomeadas

Seguindo `lib/championship/queries.ts`: cada primitiva mockável individualmente, nunca uma cadeia
`select().from().where()` montada dentro da página ou da action.

| Função                                                | Devolve                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `getLatestFinishedRound()`                            | a `finished` de maior `number` — a "rodada fechada" da Home                            |
| `getNextRound()`                                      | a `upcoming` de menor `number`                                                         |
| `listRoundMatches(roundId)`                           | partidas ordenadas por `scheduledAt`                                                   |
| `getTeamRoundResult(fantasyTeamId, roundId)`          | uma linha de `round_team_result` ou `null`                                             |
| `listRoundRoster(fantasyTeamId, roundId)`             | as 5 vagas congeladas, com nickname/organização do jogador                             |
| `getTopRoundScorers(roundId, limit)`                  | maiores pontuadores do jogo — usa `round_player_score_points_idx`                      |
| `getRoundPriceMovers(roundId, limit)`                 | `{ risers, fallers }` numa consulta cada — usa `round_player_score_delta_idx`          |
| `getStandingRowsForRoundByChampionship(ids, roundId)` | `Map<championshipId, StandingRow[]>` lendo `round_team_result` em vez do score ao vivo |

A última é a irmã de `getStandingRowsByChampionship` — mesma forma, mesma `StandingRow`, então
`rankStandings` funciona sobre ela sem uma linha de mudança. É exatamente o cenário que o comentário de
`lib/championship/standings.ts:6-8` já antecipava: _"se a base de pontuação mudar no futuro (ex.
snapshot por rodada), só a query muda"_.

### 4.2 `lib/round/format.ts`

`formatMatchKickoff(date)` → `"qua, 12/03 às 21:00"` (dayjs, locale pt-br, como
`lib/championship/format.ts` e `lib/market/window.ts` já fazem);
`availabilityLabel(a)` → `"Reserva" | "Lesionado" | "Time eliminado" | "Dúvida"`;
`availabilityMessage(nickname, availability, note)` → a frase completa do alerta.

### 4.3 `lib/home/` — tipos, regras puras e o agregador

`types.ts` — `HomeSummary`, `RoundRecap`, `NextRoundBrief`, `RoundHighlights`, `LineupAlert`,
`RoundMatch`, `PriceMover`; e `ChampionshipPlacement` (reaproveitado de
`components/profile/championship-placements.tsx`) ganha `change: number | null`.

`summary.ts` — **as funções puras**, o coração testável desta fatia:

- `patrimonyCents(result)` → `balanceCents + squadValueCents`.
- `patrimonyDeltaCents(current, previous)` → `null` quando não há rodada anterior (primeira rodada
  fechada não inventa variação).
- `placementChanges(current, previous, userId)` → posição atual, total de membros e a variação
  (`previous - current`), `null` quando o usuário não estava classificado antes.
- `lineupAlerts(roster, matches)` → um alerta por jogador dos 5 que não joga: por `availability` ≠
  `available`, **ou** porque a organização dele não aparece em nenhuma `match` da próxima rodada
  (o caso "time sem jogo"). Vaga vazia gera o seu próprio alerta.

`queries.ts` — `getHomeSummary(userId, userName)`: compõe tudo, resolvendo em paralelo com
`Promise.all` o que não depende de nada e sequenciando só o que depende do `roundId`. Reusa
`getTeamOverview(userId, userName)` com **exatamente os mesmos argumentos do layout**, para a
memoização por request (`lib/team/queries.ts:87`) valer e a Home não custar consulta nova de time.

---

## 5. UI — `/home`

Só variáveis de tema de `app/globals.css`, moldura via `<Panel>`, dark mode Valorant. **Nenhum
componente shadcn novo a instalar** — `alert`, `badge`, `button`, `table` já existem. Usar a skill
`frontend-design` ao desenhar os componentes novos.

### `app/(app)/home/page.tsx` (Server Component)

`metadata: { title: "Início | VLR Fantasy" }`. Sessão + `getHomeSummary`, e a coluna única do fluxo
temporal em `<main className="mx-auto max-w-7xl px-6 py-9">` com `flex flex-col gap-6`:

```
⚠ CONVITES PENDENTES            <PendingInvites>            (some sozinho se vazio)
┌ O QUE ACONTECEU — Rodada 3 ─  <RoundRecap>
│  87.4 pts    patrimônio +12.5
│  Liga dos Cria   2º de 6   ↑ 1
┌ O QUE VEM — Rodada 4 ───────  <NextRoundBrief>
│  Mercado fecha em 36h 12m     <MarketCountdown>
│  ⚠ TenZ não joga (banco)      <LineupAlerts>
│  SEN x LOUD  qua 21:00        <MatchList>
┌ DESTAQUES DA RODADA ────────  <RoundHighlights>
│  maior pontuador │ sobe │ desce
```

### Componentes — `components/home/`

| Arquivo                | Tipo   | Papel                                                                                                                                                                                                                 |
| ---------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `round-recap.tsx`      | server | `<Panel>` com pontos do time (`formatScore`), patrimônio (`formatCredits` + `formatCreditsDelta`, `text-success`/`text-destructive` pelo sinal) e as colocações. Estado vazio quando ainda não houve rodada fechada   |
| `market-countdown.tsx` | client | Resolve o TODO de `lib/team/types.ts:63`. Renderiza `closesIn` **vindo do servidor** no primeiro paint e só passa a tickar (30s) depois de montar — sem mismatch de hidratação. `<time dateTime>` + `aria-live="off"` |
| `lineup-alerts.tsx`    | server | `<Alert variant="destructive">` com um item por jogador indisponível e o motivo em pt-BR. Não renderiza nada quando os 5 jogam                                                                                        |
| `match-list.tsx`       | server | Uma linha por partida: organizações, evento, `formatMatchKickoff`. Partida que envolve algum dos seus 5 ganha `ring-1 ring-primary/40` e um `<Badge>` "Seu jogador"                                                   |
| `next-round-brief.tsx` | server | `<Panel>` que compõe countdown + alertas + calendário                                                                                                                                                                 |
| `price-mover-list.tsx` | server | Lista compacta com `<PlayerIdentity>` e `formatCreditsDelta` — serve tanto para valorizações quanto para desvalorizações, via prop `tone`                                                                             |
| `round-highlights.tsx` | server | `grid gap-6 md:grid-cols-3`: `<ScorerHighlight>` (reuso direto) + duas `<PriceMoverList>`                                                                                                                             |

**Reuso em vez de componente novo:** `components/profile/championship-placements.tsx` ganha o campo
opcional `change` e passa a renderizar `↑ 1` / `↓ 2` / `—`. O `/profile` continua passando `null` e não
muda de aparência. Nada é duplicado.

Estados vazios em pt-BR, no padrão inline que `ScorerHighlight` já usa: _"A primeira rodada ainda não
foi fechada."_, _"Nenhuma partida marcada para a próxima rodada."_, _"Seus 5 jogadores estão
confirmados."_

### Navegação e redirects

- `components/layout/app-header.tsx:28` — `{ label: "Início", icon: Home, href: "/home" }`. Nenhuma
  outra rota começa com `/home`, então o `pathname.startsWith(href)` que já existe funciona sem ajuste.
- `proxy.ts` — `"/home"` em `PROTECTED_PREFIXES` **e** `"/home/:path*"` no `matcher`.
- Os **5 destinos de login** passam a apontar para `/home`: `app/(auth)/login/page.tsx:19`,
  `app/(auth)/signup/page.tsx:19`, `components/auth/sign-in-form.tsx:42`,
  `components/auth/sign-up-form.tsx:41`, `components/auth/google-button.tsx:13` (`callbackURL`).
- `revalidatePath("/home")` entra em `respondToInvite` (`app/(app)/ranking/actions.ts`) e nas três
  actions de `app/(app)/my-team/actions.ts` — a Home mostra escalação e alertas dos seus 5.

---

## 6. Seed — `db/seed.ts`

`seedActiveRound` (hoje uma rodada hardcoded, `db/seed.ts:246`) vira `seedRounds`: **Rodada 1 ativa**,
**Rodada 2** e **Rodada 3** `upcoming`, com janelas de mercado coerentes. Novo `seedMatches`: ~10
partidas por rodada entre as organizações que já aparecem em `PLAYERS`. `PLAYERS` ganha
`availability` variada (dois `bench`/`injured`/`eliminated` com nota, o resto `available`).

O passo final de `main()` é a chave: **`closeActiveRound`** (§3), chamada uma vez e só quando ainda não
existe nenhuma rodada `finished`. O ambiente de desenvolvimento nasce com a Rodada 1 fechada e com
snapshots **reais** — gerados pelo mesmo código de produção, não por números escritos à mão no seed.

Ordem em `main()`: `seedPlayers` → `seedRounds` → `seedMatches` → `backfillUsernames` →
`seedExistingUsersTeams` → `closeRoundOnce`.

---

## Arquivos tocados

| Arquivo                                               | Mudança                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `db/schema/matches.ts` · `db/schema/round-results.ts` | **novos** — `match` + os três snapshots                           |
| `db/schema/players.ts`                                | `availability` + `availability_note`                              |
| `db/schema/{index,relations}.ts`                      | barrel + relations das 4 tabelas novas                            |
| `drizzle/00XX_*.sql`                                  | **gerado** — não editar                                           |
| `lib/team/types.ts`                                   | `PLAYER_AVAILABILITIES`, `PlayerAvailability`, campos em `Player` |
| `lib/scoring/{team,pricing}.ts`                       | **novos** — capitão ×2 e o motor de preço                         |
| `lib/round/{queries,format,types}.ts`                 | **novos** — leituras de rodada, partidas e snapshots              |
| `lib/home/{types,summary,queries}.ts`                 | **novos** — regras puras + o agregador da tela                    |
| `db/close-round.ts` · `package.json`                  | **novo** — `closeActiveRound` + script `db:round:close`           |
| `db/seed.ts`                                          | 3 rodadas, partidas, disponibilidade, fechamento da rodada 1      |
| `lib/team/{queries,mappers}.ts`                       | `teamPoints` no lugar do `reduce`; `availability` no `Player`     |
| `lib/championship/queries.ts`                         | capitão no `sum`; `getStandingRowsForRoundByChampionship`         |
| `app/(app)/home/page.tsx`                             | **nova**                                                          |
| `components/home/*`                                   | **novos** — 7 componentes                                         |
| `components/profile/championship-placements.tsx`      | campo opcional `change` (reuso, sem duplicar)                     |
| `components/layout/app-header.tsx` · `proxy.ts`       | "Início" vira link; `/home` protegida                             |
| `app/(auth)/**` · `components/auth/*`                 | 5 redirects `/my-team` → `/home`                                  |
| `app/(app)/{ranking,my-team}/actions.ts`              | `revalidatePath("/home")`                                         |

---

## Ordem de execução

0. ~~Copiar este plano para `.claude/plans/07-aba-inicio.md`~~ — **feito**.
1. **Domínio puro, sem banco** — `lib/scoring/{team,pricing}.ts`, `lib/round/format.ts`,
   `lib/home/summary.ts` + os 4 arquivos de teste. Tudo verde antes de tocar no schema.
2. **Schema** — `matches.ts`, `round-results.ts`, `availability` em `players.ts`, barrel, relations.
3. **Migration** — `pnpm db:generate` → `pnpm db:migrate`. **Ainda não rodar o seed.**
4. **Capitão ×2** — `teamPoints` em `lib/team/queries.ts` e o `sum` de `lib/championship/queries.ts`.
   **Rodar a suíte aqui**: é onde código já testado muda de regra, e é o passo com mais chance de
   quebrar teste existente.
5. `db/close-round.ts` + `db/close-round.test.ts` (transação mockada) + o script no `package.json`.
6. `db/seed.ts` (3 rodadas, partidas, disponibilidade, fechamento) → `pnpm db:seed`. **Passo de maior
   risco** — conferir no `db:studio` que `round_player_score`, `round_team_result` e `round_roster`
   têm linhas, que a Rodada 1 está `finished` e a 2 `active`, e que nenhum preço ficou `<= 0`.
7. `lib/round/queries.ts`, `lib/championship/queries.ts` (variante por rodada), `lib/home/queries.ts`.
8. `components/home/*` + testes; `championship-placements.tsx` ganha `change`.
9. `app/(app)/home/page.tsx`, header, `proxy.ts`, os 5 redirects, os `revalidatePath` + atualizar os
   testes que quebram.
10. `pnpm test` → `pnpm lint` → `pnpm exec prettier --write .` → `pnpm build`.

---

## Verificação

### Testes (Vitest 4 + RTL, `pnpm test`) — usar a skill `react-testing-library`

Padrões do projeto: `vi.hoisted()` + `vi.mock("@/db", …)` com `txStub`; mock **individual** de cada
primitiva nomeada de `queries.ts`; import do módulo sob teste **depois** dos `vi.mock`; queries por
role/label acessível; nomes de teste em pt-BR. Banco **sempre** mockado.

**Novos:**

- `lib/scoring/team.test.ts` — capitão dobra; sem capitão soma simples; vaga vazia não soma; time
  vazio dá 0.
- `lib/scoring/pricing.test.ts` — pontuar acima da média valoriza e abaixo desvaloriza; pontuar
  exatamente a média dá delta 0; o teto de 15% limita uma pontuação absurda; o piso `MIN_PRICE_CENTS`
  segura o preço acima de zero (o `CHECK` do banco exige `> 0`); e a invariante
  `nextPriceCents(x) - x === priceDeltaCents(x)`.
- `lib/home/summary.test.ts` — `patrimonyCents` soma saldo e elenco; `patrimonyDeltaCents` devolve
  `null` sem rodada anterior; `placementChanges` distingue subiu/desceu/manteve/estreou;
  `lineupAlerts` acusa banco, lesão, eliminado, vaga vazia **e** organização sem partida na rodada, e
  fica em silêncio quando os 5 jogam.
- `lib/round/format.test.ts` — `formatMatchKickoff` (o `TZ: "UTC"` de `vitest.config.ts` mantém isso
  determinístico) e os rótulos pt-BR de disponibilidade.
- `db/close-round.test.ts` — sem rodada ativa devolve `null` e não escreve nada; com rodada ativa
  grava os três snapshots, zera os scores, finaliza a ativa **antes** de promover a próxima, e cria a
  rodada seguinte quando não há `upcoming`.
- `components/home/*.test.tsx` — `round-recap`: mostra `"87.4"`, `"+12.5"` e `"2º de 6"`, e cai no
  estado vazio sem rodada fechada; `market-countdown`: renderiza o texto do servidor no primeiro
  paint e atualiza depois; `lineup-alerts`: mostra nickname e motivo, e não renderiza nada com os 5
  confirmados; `match-list`: a partida com jogador meu recebe o selo e a sem jogador não;
  `price-mover-list`: sinal `+` nas altas e `−` nas quedas.

**Quebram e precisam ser atualizados** (mudança de rota/regra, não de intenção):

- `components/layout/app-header.test.tsx:69-77` — hoje afirma que "Início" **não** é link; agora é,
  com `aria-current` em `/home`.
- `components/auth/sign-in-form.test.tsx` e `sign-up-form.test.tsx` — o `push` esperado vira `/home`.
- Qualquer teste que dependa da soma de pontos sem capitão (`lib/championship/standings.test.ts`,
  `app/(app)/ranking/actions.test.ts`, testes de `TeamStats`/header com `points`).

### Manual (`pnpm dev`)

1. `pnpm db:migrate && pnpm db:seed` — sem erro; no `db:studio`, Rodada 1 `finished` com linhas nos
   três snapshots, Rodada 2 `active`, Rodada 3 `upcoming`, e todo `player.price_cents > 0`.
2. Entrar com uma conta existente → cai em `/home`, e "Início" está vermelho no topo.
3. **O que aconteceu**: os pontos batem com a soma do `round_roster` **com o capitão dobrado**; o
   patrimônio confere com `balance_cents + squad_value_cents`; a colocação bate com `/ranking`.
4. **O que vem**: a contagem regressiva anda sozinha (esperar ~1 min sem recarregar); as partidas
   aparecem na ordem do horário; a partida de uma organização dos seus 5 vem destacada.
5. **Alertas**: com um jogador `injured` no time, o aviso aparece com o motivo; vender esse jogador em
   `/my-team` e voltar → o alerta some, e a vaga vazia gera o seu próprio aviso.
6. **Destaques**: o maior pontuador bate com o maior `points` de `round_player_score`; a primeira
   valorização bate com o maior `price_delta_cents`, e a primeira desvalorização com o menor.
7. **Convites**: convidar essa conta para um campeonato de outra → o convite aparece no topo de
   `/home`; aceitar por lá atualiza a tela sem recarregar (é o `revalidatePath("/home")` novo).
8. **Virar a rodada**: `pnpm db:round:close` → a Home passa a mostrar a Rodada 2 como fechada, os
   preços do mercado em `/my-team` mudaram, e as colocações agora exibem `↑`/`↓` em relação à Rodada
   1. Rodar de novo → a Rodada 3 fecha e uma Rodada 4 nasce sozinha.
9. `/home` deslogado redireciona para `/login`.

---

## Notas de implementação (divergências do plano)

Três pontos em que o código executado difere da letra deste plano, todos deliberados:

1. **`getNextRound()` lê a rodada `active`, não a `upcoming` de menor número** (§4.1). Fechar uma
   rodada promove a `upcoming` a `active` na mesma transação, então a "próxima rodada" do usuário —
   a do mockup, `O QUE VEM — Rodada 4` logo após `Rodada 3` fechar — é exatamente a que ficou
   `active`. É também a única com janela de mercado valendo, que é o que a contagem regressiva mede.
   Há um fallback para a `upcoming` de menor número caso não exista rodada `active`.

2. **Promover uma rodada rebaseia a janela de mercado quando a herdada não contém o "agora"**
   (§3, passo 7). O plano só garantia "o jogo nunca fica sem mercado" no ramo que _cria_ a rodada;
   sem a mesma garantia no ramo que _promove_, o primeiro `pnpm db:round:close` deixava o jogo numa
   rodada com o mercado fechado e sem nenhuma forma de reabri-lo.

3. **A Home mostra os três estados do mercado** — abre em / fecha em / fechado — via
   `formatMarketCountdown` (`lib/market/window.ts`), em vez de concatenar `formatTimeLeft` a um
   prefixo fixo. O prefixo fixo produzia "Mercado fecha em Encerrado" e contradizia o `/my-team`
   quando a janela ainda não tinha aberto.

`RoundMatch`/`PriceMover` ficaram em `lib/round/types.ts` (e não em `lib/home/types.ts`, §4.3), já
que são a forma de retorno das queries de rodada; `lib/home/types.ts` importa de lá.
