# Aba Início — o desempenho dos seus 5, e o circuito por região

## Context

`prompts/09_players_match_information.md` pede a terceira passada na Home. As três seções existem e já
leem dados reais do pipeline do vlr.gg (`.claude/plans/08-pipeline-vlr-scraping.md`), mas cada uma tem
uma lacuna concreta:

1. **"O que aconteceu"** (`components/home/round-recap.tsx`) é só o agregado do time — pontos,
   patrimônio, colocação. **Não existe uma única leitura de `player_match_stat` por jogador** no app:
   `listLiveRoundScores` (`lib/round/queries.ts:243`) é o único consumidor fora de `lib/vlr/`, e ele
   soma tudo num número só. O usuário não vê o que os seus 5 fizeram em campo, nem como a partida
   deles terminou.
2. **"Próximos jogos"** filtra por **campeonato** (`eventFilterOptions`, `lib/round/events.ts:92`), não
   por região, e mostra a contagem de fechamento do mercado também em "Todos" — onde ela é falsa por
   construção: o mercado fecha por **campeonato + dia** (`marketClosesByMatch`,
   `lib/market/window.ts:47`), então um único relógio no topo de uma lista de várias ligas anuncia um
   fechamento que não é o do usuário. No card, o campeonato aparece como o nome cru e apagado
   (`match-schedule.tsx:163`), sem dizer de onde ele é.
3. **"Destaques da rodada N"** carrega o número da rodada no título, não tem filtro nenhum, e aparece
   assim que **qualquer** partida da rodada é extraída — spoiler do dia ainda em andamento.

**Não existe conceito de região no domínio.** `vlr_event.region` e `vlr_team.region` existem no schema
(código de 2 letras da bandeira), mas nenhuma query os seleciona — e eles estão vazios em produção por
um bug descrito em §6.

**Resultado pretendido:** a Home passa a responder três perguntas que hoje ela não responde — _como os
meus 5 vêm jogando_ (gráfico de linhas sobre `player_match_stat`, com filtro por jogador e por
métrica), _como terminaram os jogos deles_ (placar por partida, um por partida mesmo quando dois dos
meus se enfrentam), e _o que está acontecendo na minha região_ (filtro por região em Próximos jogos e
em Destaques, com o mercado e os destaques respeitando o recorte).

### Decisões (confirmadas na entrevista)

| Pergunta          | Decisão                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Seção 1           | **Mantém** pontos/patrimônio/colocações no topo; gráfico, resumo e placares entram abaixo          |
| Eixo Y do gráfico | **Seletor de métrica** — Pontos (padrão), ACS, Rating, Abates, K/D                                 |
| Eixo X do gráfico | **Por partida**, últimas N séries de cada jogador, alinhadas por recência                          |
| Região            | **Derivada do nome do campeonato** (`lib/round/regions.ts`), bandeira do vlr como reforço          |
| Nome da seção 1   | **"Desempenho do seu time — Rodada N"**                                                            |
| Gráfico           | **shadcn `chart` + recharts** — é o equivalente shadcn, e o CLAUDE.md manda instalar quando existe |

### Fora de escopo

- Reescrever `marketClosesByMatch` para agrupar por região: a regra continua **campeonato + dia**. O
  filtro de região apenas escolhe **quais** fechamentos entram no relógio do topo.
- Normalizar organização (`player.team` / `match.teamA`) em FK — segue sendo igualdade de texto, como
  `db/schema/matches.ts:42-44` documenta.
- Histórico navegável ("ver rodada 2"), placar ao vivo mapa a mapa, VODs.

---

## Princípio norteador

**Uma linha de `player_match_stat` já é tudo o que a tela precisa; o que falta é uma leitura por
jogador.** O índice `player_match_stat_player_idx (playerId, matchId)` existe desde o plano 08 com o
comentário _"o histórico do jogador ('últimas 5 partidas')"_ — este plano é quem finalmente o usa.

E, como nos planos 03/06/07: **regra pura, separada da query.** `eventRegion`, `buildFormSeries`,
`groupPerformancesByMatch`, `summarizeRosterRound`, `revealedRegions` e `highlightsFor` são funções
puras, testáveis em milissegundos, sem tocar banco nem React.

---

## 1. Região — `lib/round/regions.ts` (novo, puro)

Irmão de `lib/round/events.ts` (que já faz tier e nome curto), mesma forma:

```ts
export const EVENT_REGIONS = [
  "international",
  "americas",
  "emea",
  "pacific",
  "china",
  "other",
] as const;
export type EventRegion = (typeof EVENT_REGIONS)[number];

/** "Champions Tour 2026: Americas Stage 2" → "americas"; "Valorant Masters Toronto" → "international". */
export function eventRegion(
  event: string,
  regionCode?: string | null,
): EventRegion;
export function regionLabel(r: EventRegion): string; // "Internacional" | "Americas" | "EMEA" | ...
export function regionFilterOptions(
  matches: readonly RoundMatch[],
): RegionFilterOption[];
```

Derivação, em ordem (tabela de regex → região, como `eventTier` já faz):

1. `americas` — `americas | north america | \bna\b | latam | brazil | brasil | \bbr\b`
2. `emea` — `emea | europe | \beu\b | turkey | mena | \bcis\b`
3. `pacific` — `pacific | korea | japan | \bsea\b | south asia | oceania`
4. `china` — `china | \bcn\b`
5. `international` — `masters | \bchampions\b` **sem** nenhum token regional acima
6. `other` — resto; aqui, e só aqui, cai no `regionCode` da bandeira (`br|us|ar` → americas, `kr|jp|sg`
   → pacific, `cn` → china, `eu|de|fr|tr` → emea)

**Por que o nome antes da bandeira:** o nome é o dado que sempre existe (`match.event` é `NOT NULL`) e
que casa com o recorte que o usuário tem na cabeça; `vlr_event.region` é opcional, é país e não liga, e
hoje está vazio nos eventos seguidos (§6). Ordem dos chips: `EVENT_REGIONS` (internacional primeiro —
Masters e Champions são os que movem o mercado), depois contagem, depois nome — o mesmo desempate
estável de `eventFilterOptions`.

`RoundMatch` **não muda**: a região sai de `match.event`, que a query já traz.

---

## 2. Leitura por jogador — `lib/player/` (novo)

### 2.1 `lib/player/types.ts`

```ts
/** O que um jogador fez em **uma série** — a soma/média dos mapas daquela partida. */
export type PlayerMatchPerformance = {
  playerId: string;
  nickname: string;
  team: string; // organização
  matchId: string;
  event: string;
  scheduledAt: Date;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  status: MatchStatus;
  points: number; // SUM(fantasyPoints)
  kills: number;
  deaths: number;
  assists: number; // SUM
  acs: number | null;
  rating: number | null; // AVG entre os mapas
  mapsWon: number;
  mapsPlayed: number;
};
```

### 2.2 `lib/player/queries.ts` — `listRosterPerformances(playerIds, q = db)`

Primitiva nomeada, mockável, no padrão de `lib/round/queries.ts`. Uma consulta:

`player_match_stat ⋈ match ⋈ player`, `where inArray(playerMatchStat.playerId, playerIds)`,
`groupBy(player.id, match.id)`, `orderBy desc(match.scheduledAt)`, `limit(200)` (guarda de sanidade —
5 jogadores nunca chegam perto). Agregados com o **template `sql` do Drizzle**, não SQL cru:
`sum(fantasy_points)::float8`, `sum(kills)`, `avg(acs)`, `avg(rating)`,
`sum(case when won then 1 else 0 end)`, `count(*)`. Bate exatamente no
`player_match_stat_player_idx`.

`playerIds` vazio → devolve `[]` **sem consultar** (é o estado de todo time novo).

### 2.3 `lib/player/form.ts` — as regras puras

```ts
export const FORM_METRICS = ["points", "acs", "rating", "kills", "kd"] as const;
export type FormMetric = (typeof FORM_METRICS)[number];
export function metricLabel(m: FormMetric): string; // "Pontos" | "ACS" | "Rating" | "Abates" | "K/D"
export function metricValue(
  p: PlayerMatchPerformance,
  m: FormMetric,
): number | null;

/** As `size` partidas mais recentes **de cada jogador**, em ordem cronológica. */
export function lastMatchesPerPlayer(
  rows,
  size,
): Map<string, PlayerMatchPerformance[]>;

/** Os pontos do gráfico, alinhados por recência: "J-4" … "Último". */
export function buildFormSeries(
  rows,
  metric,
  size,
): {
  points: Array<{ label: string } & Record<string, number | null>>; // chave = playerId
  series: Array<{ playerId: string; nickname: string }>;
};

/** Uma entrada por **partida** — dois dos seus 5 no mesmo jogo caem na mesma entrada. */
export function groupPerformancesByMatch(rows): RosterMatchRecap[];

/** "3 dos seus 5 jogaram: 2 vitórias e 1 derrota, 54.5 pontos. Melhor: aspas (28.0)." */
export function summarizeRosterRound(recaps): string | null;
```

`groupPerformancesByMatch` é a resposta literal ao prompt: agrupar por `matchId` faz o placar único
cair sozinho, e cada jogador ganha um `side: "A" | "B"` por igualdade de texto entre `player.team` e
`match.teamA/teamB`. Ordenado do mais recente para o mais antigo.

**Alinhamento por recência, não por data:** jogadores de ligas diferentes jogam em dias diferentes; um
eixo de datas produziria cinco linhas tracejadas que nunca se cruzam. Alinhar por "quantos jogos
atrás" é o que torna o gráfico uma comparação de forma — e o tooltip diz, por ponto, qual foi a
partida.

---

## 3. Seção 1 — "Desempenho do seu time"

### Estrutura

Um `<Panel>` só, três blocos empilhados separados por `<Separator>` (shadcn, já instalado):

```
┌ DESEMPENHO DO SEU TIME — RODADA 3 ──────────── [Pontos ▾] [Todos][Sacy][TenZ]… ┐
│  87.4 pts     Patrimônio 412.0 (+12.5)     Liga dos Cria  2º de 6  ↑1          │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  ╭ gráfico de linhas — uma linha por jogador, eixo X = J-4 … Último ╮          │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  3 dos seus 5 jogaram: 2 vitórias e 1 derrota, 54.5 pontos. Melhor: aspas.     │
│  LOUD 2 × 1 MIBR   ·  Americas · qua, 03/09                                    │
│     Sacy   34/18/9   ACS 241   +22.5                                           │
│     aspas  29/20/4   ACS 265   +18.0                                           │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Componentes

| Arquivo                                    | Tipo   | Papel                                                                                                                                     |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `components/home/team-performance.tsx`     | client | Dono do `<Panel>` e dos filtros (métrica + jogador). Compõe os três blocos. Entra no lugar de `<RoundRecap>` em `app/(app)/home/page.tsx` |
| `components/home/round-recap.tsx`          | server | **Perde o `<Panel>`** e vira a faixa de números. O corpo (pontos, patrimônio, `<ChampionshipPlacements>`) não muda                        |
| `components/home/player-form-chart.tsx`    | client | `ChartContainer` + `LineChart`. Uma `<Line>` por jogador, `--chart-1..5`. Filtro por jogador some a linha, não refaz a consulta           |
| `components/home/player-match-results.tsx` | server | O resumo em uma frase + uma entrada por partida com placar e a linha de cada um dos seus naquele jogo                                     |
| `components/home/filter-chip.tsx`          | client | **Extraído** de `match-schedule.tsx:236` — o mesmo chip serve jogador, métrica e região. É a dedução que o CLAUDE.md exige                |

O filtro de jogador e o de métrica vivem no header do `<Panel>` (§5), e o estado é do
`<TeamPerformance>` — filtrar é esconder linha, nunca consultar de novo.

### Acessibilidade do gráfico

Junto do SVG, uma `<table className="sr-only">` com os mesmos números (`<caption>` dizendo a métrica).
Um gráfico de linhas é ilegível por leitor de tela, e essa tabela é também o que os testes RTL
consultam — sem depender de `<path>` do recharts, que o jsdom não mede.

---

## 4. Gráfico — shadcn `chart` + recharts

- `pnpm dlx shadcn@latest add chart` → `components/ui/chart.tsx`; `pnpm add recharts`.
  (Confirmado via Context7 `/shadcn-ui/ui`: é o componente oficial, e `ChartContainer` aceita
  `initialDimension` — o que permite render em jsdom.)
- **`app/globals.css`: `--chart-2..5` precisam mudar.** Hoje são `#b7b7b7 / #8b92a0 / #5a616d /
#2b2f36` — quatro cinzas indistinguíveis entre si num gráfico de 5 linhas. Nova paleta, toda dentro
  da identidade escura do Valorant e reaproveitando tokens que a tela já usa:
  `--chart-1: #ff4655` (primary) · `--chart-2: #4de3ee` (info) · `--chart-3: #3ddc84` (success) ·
  `--chart-4: #ffb454` · `--chart-5: #a78bfa`. É variável de tema, o único lugar onde cor se escreve.
- `ChartConfig` mapeia `playerId → { label: nickname, color: "var(--chart-N)" }`; as `<Line>` usam
  `stroke="var(--color-<playerId>)"`, que é o que `ChartStyle` injeta.
- `connectNulls` ligado: um jogador com menos partidas que os outros deixa buraco, não corta a linha.

---

## 5. `Panel` ganha um slot de ações

`components/layout/panel.tsx` passa a aceitar `actions?: React.ReactNode`, renderizado à direita do
`<h2>` (`flex items-center justify-between gap-3`, `flex-wrap`). Sem ele, os três filtros desta fatia
(métrica, jogador, região) teriam de ficar soltos no corpo de cada painel, longe do título que
qualificam. Quem não passa `actions` não muda de aparência.

---

## 6. Próximos jogos

### 6.1 Filtro por região no lugar do filtro por campeonato

`components/home/match-schedule.tsx` troca `eventFilterOptions` por `regionFilterOptions`; o estado em
`upcoming-matches.tsx` vira `selectedRegion: EventRegion | null` (`null` = "Todos"). O grupo de botões
vira `aria-label="Filtrar por região"`. `eventFilterOptions` / `shortEventLabel` **continuam** — o nome
curto agora é usado no card (§6.3).

### 6.2 O relógio do mercado some em "Todos"

```
selectedRegion === null  →  nenhum countdown; uma linha explicando por quê
selectedRegion !== null  →  <MarketCountdown> com nextMarketClose(matches da região, now)
```

A frase do estado "Todos": _"Escolha uma região para ver quando o mercado dela fecha."_ Isso resolve o
que o prompt aponta: com o fechamento sendo por campeonato + dia, um relógio único sobre o circuito
inteiro anuncia um horário que não é o de ninguém. `nextMarketClose(filtrados, now)` já faz a coisa
certa quando a região tem mais de um campeonato — pega o próximo fechamento entre eles.

Consequência: `marketClosesAt` / `marketCountdown` de `UpcomingMatches` (`lib/home/types.ts:33-35`)
deixam de ser usados no primeiro paint e **saem do tipo**; o cálculo passa a ser sempre do cliente,
depois de uma região escolhida. Sem escolha, não há relógio — logo, não há mismatch de hidratação a
evitar.

### 6.3 A origem do campeonato evidente no card

O `trailing` de cada linha (`match-schedule.tsx:160-170`) deixa de ser o nome cru e apagado:

```
AMERICAS                     ← regionLabel, negrito, cor da região via var(--chart-N)
Champions Tour · Stage 2     ← shortEventLabel(match.event), muted, title={match.event}
Mercado fecha 12:00          ← <MarketCell>, inalterado
```

`regionToken(region)` → `"--chart-1" … "--chart-5"` aplicado como `style={{ color: "var(--chart-2)" }}`
— variável de tema, não cor literal. O nome longo continua acessível no `title`, como já acontece nos
chips.

---

## 7. Destaques da rodada

### 7.1 Sem número de rodada

`<Panel title="Destaques da rodada">` sempre. `roundNumber` sai de `RoundHighlights`
(`lib/home/types.ts:41`).

### 7.2 Filtro por região, resolvido no cliente

`RoundHighlights` muda de forma: em vez de já vir cortado em `topScorer` / `risers` / `fallers`, traz
**as listas inteiras com a região de cada jogador** e a UI corta:

```ts
export type RoundHighlights = {
  partial: boolean;
  scorers: Array<RoundScorer & { region: EventRegion }>;
  movers: Array<PriceMover & { region: EventRegion }>;
  /** Regiões cujo último jogo do dia já terminou — as únicas exibíveis. */
  revealed: EventRegion[];
};
```

e uma função pura em `lib/home/summary.ts`:

```ts
export function highlightsFor(
  h: RoundHighlights,
  region: EventRegion | null,
  limit: number,
): {
  topScorer: RoundScorer | null;
  risers: PriceMover[];
  fallers: PriceMover[];
};
```

Trocar de região é filtrar um array, não uma consulta nova — o mesmo princípio do filtro de campeonato
que já existe. `PRICE_MOVER_LIMIT = 5` passa a ser aplicado aqui, não na query.

**A região de cada jogador** vem do campeonato em que ele jogou naquela rodada:

- **Caminho ao vivo** (`listLiveRoundScores`): acrescentar `event: sql<string>\`min(${match.event})\``ao`select`já existente — o`groupBy(player.id)` não muda, e um jogador disputa um campeonato por
  rodada.
- **Caminho congelado** (`getTopRoundScorers` / `getRoundPriceMovers`, que leem `round_player_score` e
  não têm evento): `leftJoin` com uma subquery `player_event` — `min(match.event)` por `playerId` sobre
  `player_match_stat ⋈ match where match.round_id = $1`. As duas perdem o parâmetro `limit` (o corte
  agora é por região, na camada pura) e o filtro de sinal dos movers continua no SQL.

### 7.3 Só depois do último jogo do dia daquela região

Função pura nova em `lib/home/summary.ts`:

```ts
/** Regiões cujos jogos de hoje já acabaram — ou que não têm jogo hoje. */
export function revealedRegions(
  matches: readonly RoundMatch[],
  now: Date,
): EventRegion[];
```

Regra: para cada região presente, olhar as partidas cujo `scheduledAt` cai no **dia de `now`** (dayjs,
como `marketGroupKey` já faz). Nenhuma partida hoje → revelada (não há o que esperar). Todas
`finished` → revelada. Qualquer uma ainda não encerrada → **não** revelada.

A entrada precisa incluir partidas já encerradas, então é `listMarketLockMatches(now)`
(`lib/round/queries.ts:275`, janela `now-24h … now+7d`, sem filtro de status) — que
`getHomeSummary` passa a chamar uma vez e usa para isto. `listUpcomingMatches` não serve: ela exclui
`finished` por definição.

Na UI, o chip de uma região não revelada fica desabilitado com `title` explicando, e selecioná-la é
impossível; se **nenhuma** região está revelada, o painel mostra
_"Os destaques saem quando o último jogo do dia terminar."_ O aviso "Parcial" que já existe continua
valendo para a rodada em andamento.

---

## 8. Correção de bordo — `lib/vlr/persist/events.ts`

`upsertEvents` sobrescreve `region`, `status`, `startsAt` e `endsAt` incondicionalmente
(`sql\`excluded.region\``). Como `lib/vlr/jobs/scrape-match.ts:81`chama o mesmo upsert passando`region: null, status: "unknown"`, **toda partida extraída apaga a região que `pnpm vlr:events`tinha
preenchido** — hoje os 5 eventos`tracked`estão com`region = NULL`e`status = 'unknown'`, enquanto
66 dos outros 71 têm região correta.

Correção mínima, no mesmo padrão que `upsertTeams` (`lib/vlr/persist/teams.ts:48`) já usa:
`region: sql\`coalesce(excluded.region, ${vlrEvent.region})\``— e o mesmo`coalesce`em`startsAt`/`endsAt`; `status`só é sobrescrito quando`excluded.status <> 'unknown'`.

Entra nesta fatia porque região virou dado de produto: sem isso o reforço de bandeira de
`eventRegion` (§1, passo 6) nunca teria valor para consultar.

---

## 9. Agregação — `lib/home/queries.ts`

`getHomeSummary` ganha, no `Promise.all` que já existe, `listMarketLockMatches()`; e depois de ter o
roster, `listRosterPerformances(playerIds dos 5)`. `HomeSummary` ganha:

```ts
performances: PlayerMatchPerformance[];   // as séries dos seus 5, mais recentes primeiro
```

`buildHighlights` passa a devolver a nova forma (§7.2) e a receber as partidas de trava para calcular
`revealed`. `upcoming` perde `marketClosesAt` / `marketCountdown` (§6.2).

---

## Arquivos tocados

| Arquivo                                                 | Mudança                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| `lib/round/regions.ts`                                  | **novo** — região a partir do nome do campeonato            |
| `lib/player/{types,queries,form}.ts`                    | **novos** — leitura por jogador + regras puras do gráfico   |
| `components/ui/chart.tsx` · `package.json`              | **novo** — shadcn `chart` + `recharts`                      |
| `app/globals.css`                                       | `--chart-2..5` viram cores distinguíveis                    |
| `components/layout/panel.tsx`                           | slot `actions` no header                                    |
| `components/home/team-performance.tsx`                  | **novo** — o painel renomeado, dono dos filtros             |
| `components/home/player-form-chart.tsx`                 | **novo** — gráfico de linhas + tabela `sr-only`             |
| `components/home/player-match-results.tsx`              | **novo** — resumo + placares, um por partida                |
| `components/home/filter-chip.tsx`                       | **novo** — extraído de `match-schedule.tsx`                 |
| `components/home/round-recap.tsx`                       | perde o `<Panel>`, vira faixa de números                    |
| `components/home/{upcoming-matches,match-schedule}.tsx` | filtro por região; countdown só com região; card com origem |
| `components/home/round-highlights.tsx`                  | sem número de rodada; chips de região; portão de revelação  |
| `lib/round/queries.ts`                                  | evento nas três queries de destaque; sem `limit`            |
| `lib/home/{types,queries,summary}.ts`                   | `performances`, `highlightsFor`, `revealedRegions`          |
| `app/(app)/home/page.tsx`                               | `<TeamPerformance>` no lugar de `<RoundRecap>`              |
| `lib/vlr/persist/events.ts`                             | `coalesce` — parar de apagar região/status/datas            |

---

## Ordem de execução

1. **Domínio puro, sem banco nem React** — `lib/round/regions.ts`, `lib/player/form.ts`, as funções
   novas de `lib/home/summary.ts` (`highlightsFor`, `revealedRegions`) + os testes. Tudo verde antes
   de tocar em qualquer outra camada.
2. **Correção do `coalesce`** (`lib/vlr/persist/events.ts`) + teste; rodar `pnpm vlr:events` para as
   regiões voltarem.
3. **Queries** — `lib/player/queries.ts`; evento e remoção do `limit` em `getTopRoundScorers`,
   `getRoundPriceMovers`, `listLiveRoundScores`.
4. **`lib/home/{types,queries}.ts`** — nova forma de `HomeSummary` (é aqui que os testes de
   `summary.test.ts` e dos componentes começam a quebrar; é esperado).
5. **Infra de UI** — `pnpm dlx shadcn@latest add chart`, `pnpm add recharts`, paleta em `globals.css`,
   `actions` no `Panel`, `filter-chip.tsx` extraído (e `match-schedule.tsx` passando a importá-lo).
6. **Seção 1** — `round-recap.tsx` sem `<Panel>`, `player-form-chart.tsx`,
   `player-match-results.tsx`, `team-performance.tsx`, `page.tsx`. Usar a skill `frontend-design`.
7. **Seções 2 e 3** — região em `upcoming-matches`/`match-schedule`, portão e chips em
   `round-highlights`.
8. **Testes** — novos + os que quebraram (`round-recap.test.tsx` perde o título do painel,
   `upcoming-matches.test.tsx` perde o countdown em "Todos", `round-highlights.test.tsx` perde o número
   da rodada, `lib/home/summary.test.ts` acompanha a nova forma).
9. `pnpm test` → `pnpm lint` → `pnpm exec prettier --write .` → `pnpm build`.
10. Copiar este plano para `.claude/plans/09-players-match-information.md` (regra do CLAUDE.md).

---

## ⚠️ Realidade dos dados hoje (ler antes de verificar)

Levantado no banco em execução, e **não é um problema deste plano — é o que a verificação vai
encontrar**:

- Os 5 jogadores escalados hoje (Sacy, Chronicle, Jamppi, TenZ, Aspas) são registros de **seed**, sem
  `vlr_id` e com **zero linhas em `player_match_stat`**. O gráfico e os placares vão renderizar o
  estado vazio — corretamente.
- A rodada `active` (#3) é de seed, sem `week_key` e sem partida extraída; as partidas reais estão nas
  rodadas 4/6/7. Por isso a seção 1 é ancorada nas **partidas do jogador**, não na rodada ativa: um
  gráfico preso à rodada ativa nasceria vazio para sempre.
- 175 dos 199 jogadores estão `needs_review = true, active = false` — não podem ser comprados. Para ver
  a tela com dado real é preciso liberar alguns jogadores extraídos no `pnpm db:studio` e escalá-los.

Há material de verdade: **850 linhas** em `player_match_stat`, **34 partidas extraídas**, 178 jogadores
com stats, num intervalo de ~11 dias. A densidade máxima é de 4 partidas por jogador — então o gráfico
deve nascer com `size = 5` e degradar bem com 1 ou 2 pontos.

---

## Verificação

### Testes (Vitest 4 + RTL, `pnpm test`) — usar a skill `react-testing-library`

Padrões do projeto: `vi.hoisted()` + `vi.mock` por primitiva nomeada, banco **sempre** mockado, import
do módulo sob teste depois dos mocks, queries por role/label, nomes em pt-BR.

**Novos:**

- `lib/round/regions.test.ts` — "Champions Tour 2026: Americas Stage 2" → americas; "VCT 2026: EMEA
  Kickoff" → emea; "Valorant Masters Toronto" → international; "Valorant Champions 2026" →
  international (e **não** americas); nome sem token cai na bandeira; sem bandeira vira `other`;
  `regionFilterOptions` conta certo e ordena com internacional primeiro.
- `lib/player/form.test.ts` — `lastMatchesPerPlayer` corta por jogador, não globalmente;
  `buildFormSeries` alinha por recência e deixa `null` para quem tem menos jogos; `metricValue`
  devolve `null` quando o stat do vlr veio vazio e não `NaN`; **`groupPerformancesByMatch` devolve uma
  entrada só quando dois dos seus 5 estão na mesma partida, com `side` "A" e "B"** (o requisito
  literal do prompt); `summarizeRosterRound` conta vitórias/derrotas e devolve `null` sem partida.
- `lib/home/summary.test.ts` (acrescentar) — `revealedRegions`: região sem jogo hoje é revelada;
  região com jogo de hoje ainda `upcoming`/`live` **não** é; todas `finished` é; jogo de ontem não
  segura a de hoje. `highlightsFor`: corta no limite, filtra por região, e "Todos" agrega.
- `components/home/player-form-chart.test.tsx` — a tabela `sr-only` traz os valores da métrica
  escolhida; trocar a métrica troca os valores; escolher um jogador deixa só a série dele na legenda;
  sem partida, o estado vazio em pt-BR.
- `components/home/player-match-results.test.tsx` — **um placar quando dois dos seus se enfrentam**,
  dois placares quando são partidas diferentes; a frase-resumo aparece; estado vazio.
- `components/home/team-performance.test.tsx` — o título é "Desempenho do seu time — Rodada 3", e os
  três blocos convivem.
- `components/home/filter-chip.test.tsx` — `aria-pressed` e a contagem.

**Quebram e precisam ser atualizados** (mudança de forma, não de intenção): `round-recap.test.tsx`
(sem `<Panel>`), `upcoming-matches.test.tsx` (sem countdown em "Todos", chips de região),
`round-highlights.test.tsx` (sem número de rodada, com chips e portão), `match-schedule.test.tsx` se
existir, e qualquer teste que construa `HomeSummary`.

### Manual (`pnpm dev`)

1. **Preparo do dado:** `pnpm vlr:events` (§8 — conferir no `db:studio` que os 5 eventos `tracked`
   voltaram a ter `region` e `status`), depois `pnpm vlr:results && pnpm vlr:work && pnpm vlr:round`.
   No `db:studio`, liberar 5 jogadores com stats (`needs_review = false`, `active = true`) e escalá-los
   em `/my-team`.
2. **Seção 1:** o título diz "Desempenho do seu time"; a faixa de pontos/patrimônio/colocação continua
   igual à de antes; o gráfico desenha uma linha por jogador escalado; trocar de métrica
   (Pontos → ACS → Rating) muda a escala do eixo Y; escolher um jogador deixa uma linha só e "Todos"
   traz as cinco; o tooltip nomeia a partida.
3. **Placares:** um jogador cujo time perdeu aparece com o placar correto; **escalar dois jogadores de
   times que se enfrentaram e conferir que o placar aparece uma vez só**, com os dois listados.
4. **Próximos jogos:** em "Todos" não há relógio de mercado, e sim a frase; escolher "Americas" faz o
   countdown aparecer e ele bate com uma hora antes do primeiro jogo do dia daquela liga; cada card
   mostra a região em destaque e o nome curto do campeonato, com o nome longo no `title`.
5. **Destaques:** o título não tem número; os chips listam só as regiões presentes; uma região com jogo
   ainda por acontecer hoje fica bloqueada com a explicação; depois que o último jogo do dia daquela
   região é marcado `finished` (dá para forçar no `db:studio`), o chip libera e os destaques daquela
   região aparecem.
6. **Regressão:** `/my-team`, `/ranking` e `/profile` inalterados; a Home continua se atualizando
   sozinha (`LiveRefresh`); tela estreita (375px) não rola na horizontal e o gráfico encolhe junto.
