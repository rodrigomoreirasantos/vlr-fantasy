# Todos os jogos do circuito, de todas as regiões — inclusive os de daqui a um mês

## Context

`prompts/13_next_games.md` pede três coisas do painel "Próximos jogos": ver **todos** os jogos
de **todas** as regiões, com **data, hora e região** em cada um, e que jogos distantes — o
exemplo é Champions no fim de setembro — **apareçam**.

Duas delas já estão prontas, e é importante saber disso antes de mexer em qualquer coisa:

1. **Data, hora e região já aparecem.** A hora vem de `formatKickoffTime`
   (`lib/round/format.ts:16`), a data é o cabeçalho de dia de `groupMatchesByDay`
   (`lib/round/schedule.ts:29`) — "Hoje" / "Amanhã" / "sáb, 06/09" —, e a região é o rótulo
   colorido de `<EventOrigin>` (`components/home/event-origin.tsx:29-34`), com o nome do
   campeonato embaixo. Não há tela nova a desenhar.
2. **A consulta já é de todas as regiões.** `listUpcomingMatches` (`lib/round/queries.ts:91`)
   não tem filtro de região nenhum: filtra `vlrEvent.tracked`, `status ≠ finished` e
   `scheduledAt ≥ agora − 6h`. O recorte por região é do cliente
   (`matchesInRegion`, `regionFilterOptions`).

**O que falta é o dado chegar.** A causa raiz está na ingestão, e é literalmente uma linha —
`lib/vlr/jobs/sync-schedule.ts:46`:

```ts
const { html } = await fetchHtml("/matches");
```

Só a **página 1**. Sem paginação, sem argumento de CLI. Compare com `syncResults`
(`lib/vlr/jobs/sync-results.ts:63-66`), que já pagina. E a fixture real de 03/09/2026 prova o
efeito:

- `lib/vlr/fixtures/match-list-schedule.html` tem **50 cards**, cobrindo `Thu, September 3` →
  `Sun, September 20`, mais um outlier em `Wed, October 14`;
- ela linka `/matches/?page=2`, que **nunca é buscada**;
- e o nome "Champions" **não aparece em nenhum** dos 9 campeonatos dessa página — enquanto
  `Valorant Champions 2026` está, sim, na página 1 de `/events`
  (`lib/vlr/fixtures/event-list.html`, 18º card).

Ou seja: o evento existe no catálogo, mas as partidas dele estão na página 2+ de `/matches`.
`/events` **não** é o problema — ele lista ongoing/upcoming primeiro, e Champions está lá.

Depois da ingestão vêm dois cortes menores, ambos de app:

3. `UPCOMING_MATCH_LIMIT = 40` (`lib/home/queries.ts:48`), ordenado por `scheduledAt ASC` — em
   semana cheia, 40 jogos são 4 a 6 dias.
4. `VISIBLE_LIMIT = 12` (`components/home/match-schedule.tsx:20`), com um "Ver mais" que abre
   **tudo de uma vez**.

E há um detalhe do pedido que muda o comportamento do filtro: os campeonatos internacionais
(Champions, Masters, e qualquer torneio em que times de regiões diferentes se enfrentam) devem
aparecer **em qualquer região selecionada**, não só no chip "Internacional". Hoje
`matchesInRegion` (`lib/round/regions.ts:249`) é estritamente igual-a-região, então quem está
vendo "EMEA" perde o jogo do próprio time dele em Champions.

**Resultado esperado:** na aba Início, o painel "Próximos jogos" mostra o calendário inteiro do
circuito — todas as regiões, meses à frente —, abrindo em "Todos"; escolher uma liga mostra os
jogos dela **mais** os internacionais; e o Champions de fim de setembro está lá porque o
`vlr:schedule` passou a ler `/matches` até a última página.

## Decisões (respondidas pelo usuário)

| #   | Pergunta                                        | Decisão                                                                                       |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Até onde paginar `/matches`?                    | **Varrer tudo** — até a última página que o próprio vlr anuncia.                                |
| 2   | Cards sem horário (TBD)?                        | **Continuar descartando.** Nada muda no parser; sem migration.                                  |
| 3   | Onde mora a lista?                              | **Na própria aba Início**, no painel "Próximos jogos" que já existe. Sem rota nova.              |
| 4   | Como as regiões se comportam?                   | Separado por região; **internacionais aparecem em toda seleção de região**.                     |
| 5   | Chip padrão ao abrir?                           | **"Todos"** — é o que já acontece (`selectedRegion` inicia `null`).                              |

## Fase 1 — `/matches` até a última página (a causa raiz)

**Arquivos**

- **Muda:** `lib/vlr/scrapers/selectors.ts`
- **Muda:** `lib/vlr/scrapers/match-list.ts` (nova função pura `lastListPage`)
- **Muda:** `lib/vlr/scrapers/match-list.test.ts`
- **Muda:** `lib/vlr/jobs/sync-schedule.ts`
- **Novo:** `lib/vlr/jobs/sync-schedule.test.ts`
- **Muda:** `scripts/vlr/schedule.ts`
- **Muda:** `docs/SCRAPING.md`

### 1a. O seletor da paginação

O bloco existe nas três listas do vlr e tem a mesma forma (conferido nas fixtures):
`span.btn.mod-page.mod-active` para a página atual e `a.btn.mod-page` para as demais — e o
**último número aparece sempre** (`1 2 3 4 … 664` em `/matches/results`, `1 2` em `/matches`).

Em `MATCH_LIST`, junto dos outros — nenhum seletor fora deste arquivo, é a regra do próprio
`selectors.ts`:

```ts
  /**
   * A paginação do rodapé. O último número está sempre visível (`1 2 3 4 … 664`
   * em `/matches/results`), então `lastListPage` sabe onde parar sem sondar
   * página por página.
   */
  pages: ".action-container-pages",
  pageItem: ".btn.mod-page",
```

### 1b. `lastListPage` — pura, testável por fixture

Em `lib/vlr/scrapers/match-list.ts`, ao lado de `parseMatchList`:

```ts
/**
 * A última página da lista, lida da própria paginação do rodapé.
 *
 * **Não** usa `requireAll`: uma lista de página única não tem paginação
 * nenhuma, e isso é um estado legítimo — devolve `1`. Diferente de um card
 * ausente, que é seletor quebrado e deve falhar alto.
 */
export function lastListPage(html: string): number {
  const $ = load(html);
  const numbers = $(`${MATCH_LIST.pages} ${MATCH_LIST.pageItem}`)
    .map((_, node) => int(text($(node))))
    .get()
    .flatMap((value) => (value === null ? [] : [value]));

  return numbers.length > 0 ? Math.max(...numbers, 1) : 1;
}
```

(`int` e `text` já vêm de `lib/vlr/scrapers/parse.ts`, os mesmos que `parseCard` usa.)

### 1c. `syncSchedule` pagina, depois grava uma vez só

```ts
/**
 * Teto de segurança da varredura de `/matches`.
 *
 * A decisão do plano 13 é "varrer tudo", e `lastListPage` é quem diz onde
 * isso acaba — hoje 2 páginas. O teto não é uma política de produto, é o
 * fusível: se o vlr mudar a paginação (ou o seletor casar no lugar errado),
 * um número absurdo viraria centenas de requisições a 1,1s cada.
 * `/matches` lista só o que está por vir; passar disso é bug, não calendário.
 */
const MAX_SCHEDULE_PAGES = 12;

export async function syncSchedule(
  options: { pages?: number } = {},
): Promise<{ matches: number; rounds: number; pages: number }> {
  const first = await fetchHtml("/matches");
  const items = [...parseMatchList(first.html, "/matches")];

  const announced = options.pages ?? lastListPage(first.html);
  const last = Math.min(announced, MAX_SCHEDULE_PAGES);
  if (announced > last) {
    logWarn("vlr.schedule.pages_truncated", { announced, visited: last });
  }

  for (let page = 2; page <= last; page += 1) {
    const path = `/matches/?page=${page}`;
    const { html } = await fetchHtml(path);
    items.push(...parseMatchList(html, path));
  }
  // …daqui para baixo, o corpo de hoje, intacto: db.transaction →
  // resolveEventIdsByName → descarte de TBD → upsertMatches →
  // aviso `without_event` → syncRoundsFromMatches → logInfo.
}
```

Três detalhes que **não** são opcionais:

- **Toda a rede antes da transação.** Hoje já é assim (uma requisição, depois `db.transaction`);
  manter. Segurar uma transação aberta por 5 × 1,1s de rede seria trocar um problema por outro.
- **`upsertMatches` já deduplica por `vlrId`** (`lib/vlr/persist/matches.ts:53`, o `Map`), então
  a mesma partida aparecendo em duas páginas entre um fetch e outro não quebra nada — não
  precisa de dedupe próprio no job.
- **`syncRoundsFromMatches` roda uma vez**, no fim, com o calendário inteiro já gravado. É o que
  mantém a numeração das rodadas cronológica: ele ordena as semanas
  (`lib/vlr/persist/rounds.ts:73`) e atribui os números em sequência **dentro da execução**.
  Varrer tudo de uma vez é, aqui, mais seguro que hoje — ver Riscos.

`logInfo("vlr.schedule.synced", …)` ganha `pages`, como `vlr.results.synced` já tem.

### 1d. O script

`scripts/vlr/schedule.ts` passa a aceitar `--pages` para override manual, no molde exato de
`scripts/vlr/results.ts` (`numberArg("pages")`), e o resumo passa a citar as páginas:

```ts
const { matches, rounds, pages } = await syncSchedule({ pages: numberArg("pages") });
return {
  ok: true,
  summary: `✓ ${matches} partidas (${pages} páginas), ${rounds} rodadas semanais sincronizadas.`,
};
```

O `deploy/vlr-cron/crontab` **não muda**: a linha das 06:00 continua `pnpm vlr:schedule`, que
agora varre sozinho.

### 1e. Doctor

Em `lib/vlr/jobs/doctor.ts`, o check `match-list` continua igual — ele prova que o card parseia.
Não vale um check novo só para a paginação: `lastListPage` devolvendo `1` numa página que tem
mais é degradação silenciosa, e é isso que o `logWarn` de `pages_truncated` e o `pages` no
`logInfo` tornam visível no log do cron.

**Testes**

`lib/vlr/scrapers/match-list.test.ts` (puro, `// @vitest-environment node`, fixtures reais):

- `lastListPage` da fixture de `/matches` → `2` (é o que a página 1 anuncia hoje);
- `lastListPage` da fixture de `/matches/results` → `664` — prova que o "…" final é lido, e é o
  caso que justifica o `MAX_SCHEDULE_PAGES`;
- HTML sem bloco de paginação → `1`.

`lib/vlr/jobs/sync-schedule.test.ts` (novo, ambiente node, rede e banco mockados — `CLAUDE.md`:
banco sempre mockado, e `lib/vlr/` nunca faz rede em teste). Molde de `lib/home/queries.test.ts`:
`vi.hoisted` + `vi.mock("@/db", …)` + `vi.mock("@/lib/vlr/http/client")` + import dinâmico depois
dos mocks. Casos:

- visita `/matches` e `/matches/?page=2` quando a página 1 anuncia 2 páginas, e passa **a soma**
  dos cards para `upsertMatches`;
- página única (sem paginação) → **uma** chamada a `fetchHtml`, comportamento de hoje preservado;
- `{ pages: 1 }` explícito não pagina, mesmo com a página anunciando 2 — é o override do script;
- `MAX_SCHEDULE_PAGES` corta a varredura e emite `vlr.schedule.pages_truncated`;
- card sem horário continua fora do lote (a regra de TBD, decisão 2, não mudou).

**Como verificar:** `pnpm test lib/vlr` e, contra a rede real,
`pnpm vlr:schedule` — o resumo deve citar mais de uma página e o log `vlr.schedule.synced` deve
trazer um `matches` bem maior que 50. Depois, no `pnpm db:studio`, conferir que existe linha em
`match` com `event` contendo "Champions" e `scheduled_at` no fim de setembro — e que o
`vlr_event` correspondente está com **`tracked = true`** (a flag é manual, `syncEvents` nunca a
escreve — `db/schema/vlr.ts:34-41`). Sem `tracked`, a partida entra no banco e mesmo assim não
aparece na tela: `listUpcomingMatches` faz `innerJoin` com `tracked = true`.

## Fase 2 — a Home deixa de cortar o calendário em 40

**Arquivos**

- **Muda:** `lib/home/queries.ts`

Uma constante e o comentário dela. O papel do número muda: era orçamento de tela ("maior que o
que cabe, para o filtro ter material"), passa a ser fusível.

```ts
/**
 * Quantos jogos do circuito a Home carrega.
 *
 * Deixou de ser orçamento de tela e virou fusível. O pedido é ver o
 * calendário inteiro — Champions de fim de setembro incluído —, e quem
 * limita a exibição é `<MatchSchedule>`, em blocos. O teto aqui existe só
 * para que um `tracked` marcado por engano num torneio de mil partidas não
 * vire um payload de RSC de megabytes a cada `<LiveRefresh>`.
 */
const UPCOMING_MATCH_LIMIT = 500;
```

Nada mais muda: `listUpcomingMatches` já ordena por `scheduledAt ASC`, já é de todas as regiões
e já dá a folga de 6h para partida em andamento (`LIVE_GRACE_MS`).

**Testes:** `lib/home/queries.test.ts` já mocka `listUpcomingMatches`; se algum caso afirma o
`40`, passa a afirmar a constante. Nenhum teste novo — a mudança é de número, e o comportamento
que ela habilita é verificado na Fase 4.

**Como verificar:** `pnpm test lib/home`.

## Fase 3 — o internacional aparece em toda região

É a decisão 4, e é a única mudança de **regra** do plano. Masters e Champions reúnem times das
quatro ligas: esconder Champions de quem está vendo "EMEA" é esconder o jogo da organização dele.

**Arquivos**

- **Muda:** `lib/round/regions.ts` (`matchesInRegion`, `regionFilterOptions`)
- **Muda:** `lib/round/regions.test.ts`
- **Muda:** `components/home/upcoming-matches.test.tsx`

`matchesInRegion` muda de significado — e por isso o JSDoc muda junto. Não nasce uma função
irmã: os dois únicos chamadores (`components/home/match-schedule.tsx:60` e
`components/home/upcoming-matches.tsx:58`) querem exatamente a regra nova, e a versão estrita
ficaria sem consumidor.

```ts
/**
 * As partidas que uma seleção do filtro entrega — `null` devolve a grade inteira.
 *
 * Uma liga (`LEAGUE_REGIONS`) devolve as dela **mais as internacionais**:
 * Masters e Champions são o palco das quatro ligas juntas, então quem está
 * vendo "EMEA" tem de ver o jogo do time de EMEA em Champions. É a mesma
 * regra que a trava do mercado já usa (`marketMatchesFor`,
 * `lib/market/window.ts:104`) — antes desta mudança, o relógio do topo do
 * painel e a trava de escalação discordavam sobre o mesmo conjunto.
 *
 * "Internacional" e "Outros" devolvem só o que é delas: a primeira já **é** o
 * recorte inteiro, e a segunda é o limbo de quem não é liga nenhuma.
 *
 * Existe porque dois componentes precisam do **mesmo** recorte: o relógio do
 * mercado no topo de "Próximos jogos" e a grade logo abaixo.
 */
export function matchesInRegion<
  T extends { event: string; regionCode?: string | null },
>(matches: readonly T[], region: EventRegion | null): T[] {
  if (region === null) return [...matches];

  const withInternational = isLeagueRegion(region);
  return matches.filter((match) => {
    const matched = matchRegion(match);
    return (
      matched === region || (withInternational && matched === "international")
    );
  });
}
```

`regionFilterOptions` tem de contar pela **mesma** regra — o comentário atual diz "o filtro não
mente sobre o que entrega", e essa frase agora custa código:

```ts
export function regionFilterOptions(
  matches: readonly RoundMatch[],
): RegionFilterOption[] {
  const own = new Map<EventRegion, number>();
  for (const match of matches) {
    const region = matchRegion(match);
    own.set(region, (own.get(region) ?? 0) + 1);
  }

  const international = own.get("international") ?? 0;

  // O chip nasce da região ter jogo **próprio**: "EMEA" não deveria aparecer
  // numa semana em que só há Champions. Mas o número que ele mostra é o que o
  // clique entrega — os dela mais os internacionais.
  return [...own.entries()]
    .map(([region, count]) => ({
      region,
      label: regionLabel(region),
      count: count + (isLeagueRegion(region) ? international : 0),
    }))
    .sort((a, b) => REGION_ORDER[a.region] - REGION_ORDER[b.region]);
}
```

`isLeagueRegion` já existe (`lib/round/regions.ts:53`) e é exatamente o portão certo: as quatro
ligas, nunca `international` nem `other`.

**Consequência de graça:** o relógio de `<UpcomingMatches>` (`:58`) passa a considerar os
internacionais junto com a liga escolhida, alinhando-se com `marketMatchesFor` — que é a função
que de fato tranca a escalação. Nenhuma linha a mudar no componente; ele já chama
`matchesInRegion`.

**Testes**

`lib/round/regions.test.ts`:

- `matchesInRegion(…, "americas")` devolve os de Americas **e** os de Champions/Masters;
- `matchesInRegion(…, "international")` devolve **só** os internacionais;
- `matchesInRegion(…, "other")` não recebe internacional de brinde;
- `matchesInRegion(…, null)` continua devolvendo a grade inteira;
- o caso existente "internacional vem primeiro, mesmo com menos jogos" (`:102-113`) segue
  válido na ordem, mas o de contagem (`:89-100`) ganha um irmão: com 1 Champions + 1 Americas +
  1 EMEA, os `count` são `international: 1`, `americas: 2`, `emea: 2`.

`components/home/upcoming-matches.test.tsx`: o caso de `:250-260` espera hoje
`["Todos3", "Internacional1", "Americas1", "EMEA1"]` e passa a esperar
`["Todos3", "Internacional1", "Americas2", "EMEA2"]`. Vale um caso novo, que é o produto desta
fase: **"o jogo de Champions aparece com Americas selecionado"** — clicar em `/Americas/` e
achar na lista o `teamA × teamB` da partida internacional.

**Como verificar:** `pnpm test lib/round/regions.test.ts components/home/upcoming-matches.test.tsx`.

## Fase 4 — a lista aguenta centenas de jogos

Com a Fase 1 e a 2, o painel passa a receber o calendário inteiro. Duas arestas aparecem: o "Ver
mais" abre tudo de uma vez (300 `<li>` num clique), e a etiqueta do dia não diz o ano.

**Arquivos**

- **Muda:** `components/home/match-schedule.tsx`
- **Muda:** `lib/round/format.ts`
- **Muda:** `lib/round/format.test.ts`
- **Muda:** `components/home/upcoming-matches.test.tsx`

### 4a. "Ver mais" em blocos

Em `components/home/match-schedule.tsx`, `ScheduleDays` troca o booleano `expanded` por uma
contagem:

```ts
/** Quantos jogos a lista mostra de saída. */
const VISIBLE_LIMIT = 12;
/** Quantos ela acrescenta a cada "ver mais". */
const LOAD_MORE_STEP = 24;
```

```tsx
const [limit, setLimit] = useState(VISIBLE_LIMIT);
const visible = matches.slice(0, limit);
const hidden = matches.length - visible.length;
const step = Math.min(hidden, LOAD_MORE_STEP);
```

e o botão vira `Ver mais {step} {step === 1 ? "jogo" : "jogos"}` com
`onClick={() => setLimit((current) => current + LOAD_MORE_STEP)}`. A `key={selectedRegion ?? "all"}`
do `<ScheduleDays>` (`:93`) continua zerando isso a cada troca de filtro — é para isso que ela
existe, e agora zera para `VISIBLE_LIMIT`, não para "recolhido".

Nada mais na tela muda: os cabeçalhos de dia já trazem `DD/MM`, então setembro, outubro e
novembro se distinguem sem separador de mês novo.

### 4b. O ano, quando o jogo é de outro ano

`formatMatchDay` (`lib/round/format.ts:27`) devolve `"sáb, 06/09"`. Com o calendário passando a
atravessar a virada do ano, `"sáb, 10/01"` fica ambíguo:

```ts
  if (day.isSame(today, "day")) return "Hoje";
  if (day.isSame(today.add(1, "day"), "day")) return "Amanhã";
  // O ano só entra quando muda: escrevê-lo sempre polui os dias de hoje e da
  // semana, que são a maioria absoluta da lista.
  return day.isSame(today, "year")
    ? day.format("ddd, DD/MM")
    : day.format("ddd, DD/MM/YYYY");
```

**Testes**

`lib/round/format.test.ts`: caso novo — data no ano seguinte traz o ano; os casos de "Hoje",
"Amanhã" e mesmo-ano continuam idênticos.

`components/home/upcoming-matches.test.tsx`: o caso do corte (`:336`, hoje
`"Ver mais 3 jogos"`) segue válido; acrescentar um caso com **mais de 36 jogos** provando que o
primeiro clique acrescenta `LOAD_MORE_STEP` e o botão continua ali com o restante — é o
comportamento que a Fase 2 torna comum.

**Como verificar:** `pnpm test components/home lib/round/format.test.ts`, e na tela: `pnpm dev`,
abrir `/home`, clicar "Ver mais" algumas vezes e chegar até o Champions de setembro; conferir o
chip "Americas" mostrando também os jogos de Champions.

## Fase 5 — o dia da grade e o dia do mercado passam a ser o mesmo (separável)

**Esta fase o prompt não pediu.** Está isolada no fim de propósito: pode ser descartada inteira
sem tocar nas outras quatro. É o achado da exploração, e ele fica mais visível justamente
porque a lista agora atravessa meses.

Existem **duas** `dayKey` no projeto, e elas discordam:

- `lib/round/day.ts:…` — `dayKey(date, tz = APP_TZ)`, `APP_TZ = "America/Sao_Paulo"`, fuso
  explícito. É a que a regra do mercado usa (`marketGroupKey`, `lib/market/window.ts:43`).
- `lib/round/schedule.ts:14` — privada, `date.getFullYear()/getMonth()/getDate()`, **fuso do
  runtime**. É a que agrupa a grade por dia.

Num servidor em UTC, uma partida às 22:00 de Brasília cai em dias diferentes nas duas — a linha
aparece sob um dia e o mercado dela fecha noutro. Pior: `formatKickoffTime` e `formatMatchDay`
também usam o fuso do runtime, então o **servidor renderiza em UTC e o navegador re-renderiza no
fuso do usuário** — divergência de hidratação em toda linha da lista.

A correção é fixar tudo em `APP_TZ`, que é o fuso que o produto já declara:

- `lib/round/schedule.ts` importa `dayKey` de `@/lib/round/day` e apaga a cópia privada;
- `lib/round/format.ts` (`formatKickoffTime`, `formatMatchKickoff`, `formatMatchDay`) e
  `lib/market/window.ts` (`formatClosesAt`) passam por `.tz(APP_TZ)`.

**Custo honesto:** `vitest.config.ts` fixa `TZ: "UTC"`, então todo teste que hoje espera
`"17:00"` para um `17:00Z` passa a esperar `"14:00"`. É mecânico, mas atinge vários arquivos
(`lib/round/format.test.ts`, `lib/round/schedule.test.ts`, `components/home/*.test.tsx`,
`lib/market/window.test.ts`). Se o custo não valer agora, **pular esta fase não afeta nada das
outras** — o defeito é anterior a este plano.

**Como verificar:** `pnpm test` inteiro, e no navegador conferir que o console não acusa mais
mismatch de hidratação em `/home`.

## Verificação de ponta a ponta

1. `pnpm test` — a suíte inteira.
2. `pnpm lint` e `pnpm exec tsc --noEmit`.
3. `pnpm vlr:schedule` contra a rede: o resumo cita mais de uma página; o log
   `vlr.schedule.synced` traz `matches` bem acima de 50 e `skippedWithoutTime` > 0 (os TBD, que
   seguem descartados pela decisão 2).
4. `pnpm db:studio`: garantir `vlr_event.tracked = true` no Champions (flag manual) e conferir
   partidas dele em `match` com `scheduled_at` de fim de setembro.
5. `pnpm dev` → `/home`:
   - o painel "Próximos jogos" abre em "Todos", com contagem alta no chip;
   - "Ver mais" acrescenta um bloco por clique e chega até o fim do calendário;
   - cada linha mostra **hora** (esquerda), **região** colorida e **campeonato** (direita), e a
     **data** no cabeçalho do dia;
   - clicar em "Americas" mostra os jogos de Americas **e** os de Champions, e o relógio do topo
     passa a considerar os dois;
   - clicar em "Internacional" mostra só os internacionais.

## Riscos e o que fica de fora

- **Rodadas futuras nascem em lote.** `syncRoundsFromMatches` cria uma `round` por semana ISO com
  partida de evento `tracked` (`lib/vlr/persist/rounds.ts:34-155`). Varrendo tudo, a primeira
  execução vai criar rodadas para todas as semanas até o fim do calendário. Elas nascem
  `upcoming` e só `closeActiveRound` promove, então isso é inofensivo — e é **mais seguro que
  hoje**: o job ordena as semanas dentro da execução, e `closeActiveRound` promove a `upcoming`
  de menor `number` (`db/close-round.ts:154-155`). Hoje, com só a página 1, o outlier de
  `Wed, October 14` já cria uma rodada de outubro **antes** das semanas intermediárias existirem
  — numeração fora de ordem. Trazer tudo de uma vez fecha essa janela em vez de abri-la.
- **Payload da Home.** Com ~200 partidas, o RSC da `/home` cresce algumas dezenas de KB, e o
  `<LiveRefresh>` (60s com jogo ao vivo, 5min parado) re-busca isso. `UPCOMING_MATCH_LIMIT = 500`
  é o teto; se na prática o número incomodar, o ajuste é essa constante — não a UI.
- **`tracked` continua manual.** Nenhuma partida aparece se o `vlr_event` dela não estiver
  marcado. O plano não mexe nisso (`syncEvents` nunca escreve a flag, por decisão do plano 08), e
  é a causa mais provável de "rodei o schedule e o Champions ainda não apareceu".
- **Casamento de evento por nome.** `resolveEventIdsByName` casa `lower(vlr_event.name)` com o
  nome do card. Partidas de mais páginas significam mais nomes a casar, então o
  `logWarn("vlr.schedule.without_event")` tende a aparecer mais — é sinal para rodar
  `pnpm vlr:events`, não regressão.
- **Jogos TBD seguem invisíveis** (decisão 2). Parte do chaveamento de Champions só entra quando
  o vlr publicar o horário. Com a paginação, ele entra na execução seguinte, sem depender de a
  partida ainda estar na página 1.
- **`/events` não é paginado neste plano.** A página 1 lista ongoing/upcoming primeiro e o
  `Valorant Champions 2026` está lá (fixture conferida). Paginar até 60 seriam 60 requisições
  semanais para trazer torneios encerrados de anos anteriores.
- **Não entra:** rota nova (decisão 3), coluna de região em `match`, migration de qualquer tipo,
  placar de partida encerrada na lista, e qualquer mudança em pontuação, saldo ou escalação —
  nada neste plano escreve no saldo do usuário.
