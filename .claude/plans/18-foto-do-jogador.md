# Foto do jogador em todo lugar

## Context

`prompts/18_players_pictures.md` pede que a foto que o vlr.gg mostra para cada jogador apareça
também no nosso produto — no card do mercado, na escalação, no resumo, nos destaques de maior/menor
pontuador e no gráfico da Home. A frase que define o alcance: _"Toda informação que contenha o
player [...] tudo deve trazer a imagem dele como base de conhecimento para o usuário."_

Hoje o produto **nunca renderizou uma imagem raster**: não há uso de `next/image` em lugar nenhum,
`next.config.ts` é o scaffold vazio, e todo retrato de jogador é um placeholder hachurado. Quatro
fatos do código mudam o tamanho desse trabalho:

1. **A foto já está no HTML que baixamos todo dia — não custa uma requisição a mais.** O job
   `vlr:rosters` (plano 17) busca `/team/{vlrId}` diariamente às 05:00
   (`lib/vlr/jobs/scrape-roster.ts:17`), e cada `.team-roster-item` traz
   `.team-roster-item-img > img[src]` → `//owcdn.net/img/668b9efe31f02.png`
   (`lib/vlr/fixtures/team-roster-17037.html:1745-1764`). O parser descarta esse bloco
   (`lib/vlr/scrapers/team-roster.ts:54-61`).
2. **O scoreboard da partida não tem foto nenhuma** (`lib/vlr/fixtures/match-detail-724899.html:2057-2070`)
   — só ícone de agente. Logo, `resolvePlayer` (`lib/vlr/persist/players.ts`) fica de fora: o caminho
   do elenco é o único que preenche.
3. **O vlr tem um sentinela de "sem foto"**: `/img/base/ph/sil.png`, a silhueta padrão — 2 dos 5
   jogadores da fixture caem nele. Precisa virar `null`, senão o banco guarda 5 "fotos" das quais 2
   são a mesma silhueta. E a URL vem protocol-relative (`//owcdn.net/...`), sem esquema.
4. **O lugar da foto já existe, vazio.** `PlayerPortrait` (`components/team/player-row.tsx:71-81`)
   é comentado como _"Placeholder hachurado até existirem imagens"_ e já é compartilhado entre
   escalação e mercado via `PlayerPortraitBadge` (`:94-109`). A mesma hachura está **copiada à mão**
   em mais dois lugares (`components/team/scorer-highlight.tsx:36`,
   `components/team/formation-board.tsx:48-69`).

**Resultado esperado:** em todas as 12 telas que mostram jogador, o rosto dele aparece ao lado do
nome — com a hachura de hoje servindo de fundo para quem ainda não tem foto, sem nenhuma tela
parecendo quebrada no estado misto.

## Decisões (fechadas com o usuário — não reabrir)

| #   | Decisão                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Servir a URL do vlr direto**, via `next/image` + `remotePatterns` para `owcdn.net`. O otimizador do Next busca no servidor, redimensiona e cacheia — o navegador nunca fala com o owcdn. Nada de baixar ou espelhar imagem (o volume de storage hoje só existe no container do cron, e o raw-store é texto, não binário). |
| 2   | **Cobrir as 12 telas** que mostram jogador, não só as 5 citadas. No gráfico da Home a foto vai nos **chips de filtro e no tooltip** — dentro da `<Line>` do recharts não cabe.                                                                                                                                              |
| 3   | **Fallback = a hachura que já existe**, virando um componente único. Sem shadcn `Avatar`, sem iniciais, sem `skeleton.tsx`.                                                                                                                                                                                                 |
| 4   | **Backfill único** por uma flag `--all` no enfileirador de elencos que já existe, além do job diário.                                                                                                                                                                                                                       |

Resolvido por mim, por não mudar o trabalho: um `src` root-relative que **não** seja o placeholder
(ex. `/img/vlr/x.png`) devolve `null` **com `logWarn`** — assim descobrimos se o vlr trocar de CDN,
em vez de perder as fotos em silêncio. Nenhuma foto da fixture é servida assim hoje.

---

## Fase 0 — a normalização, pura

**Arquivos:** `lib/vlr/scrapers/parse.ts` (muda) · `lib/vlr/scrapers/parse.test.ts` (**novo** — hoje
`parse.ts` não tem teste co-localizado).

Mora ao lado de `vlrIdFromHref` (`parse.ts:60-70`), mesma família: "pedaço sujo de HTML → valor de
domínio ou `null`".

```ts
/** A silhueta padrão do vlr — "sem foto", não uma foto. */
const VLR_PLACEHOLDER_IMG = "/img/base/ph/";

export function vlrImageUrl(src: string | undefined | null): string | null;
```

| Entrada                               | Saída                                               |
| ------------------------------------- | --------------------------------------------------- |
| `"//owcdn.net/img/668b9efe31f02.png"` | `"https://owcdn.net/img/668b9efe31f02.png"`         |
| `"/img/base/ph/sil.png"`              | `null` (sentinela)                                  |
| `"https://owcdn.net/img/x.png"`       | inalterada                                          |
| `"http://owcdn.net/img/x.png"`        | `https://…` — senão o `remotePatterns` devolve 400  |
| `undefined` / `null` / `""` / espaços | `null`                                              |
| outro `/img/...`                      | `null` + `logWarn("vlr.roster.unknown_image_host")` |

**Testes:** a tabela acima + idempotência (`f(f(x)) === f(x)`).

---

## Fase 1 — schema e migration

**Arquivos:** `db/schema/players.ts` (muda) · `drizzle/00XX_*.sql` (gerado, nunca editado à mão).

`photoUrl: text("photo_url")` logo depois de `country` (`:53`). Nullable, sem default, **sem índice**
(nunca é filtro nem ordem) e **sem CHECK** — a invariante de URL é da Fase 0, testada de graça.

**Como verificar:** `pnpm db:generate` → `pnpm db:migrate`; no `db:studio`, a coluna nasce nula em
todo mundo e nenhuma linha existente muda.

---

## Fase 2 — captura no elenco

**Arquivos:** `lib/vlr/scrapers/selectors.ts` · `team-roster.ts` · `lib/vlr/schemas.ts` ·
`lib/vlr/persist/rosters.ts` — e os testes de `team-roster.test.ts` e `rosters.test.ts`.

1. `selectors.ts:115-127` — `img: ".team-roster-item-img img"` dentro de `TEAM_ROSTER`.
2. `team-roster.ts:54-61` — `photoUrl: vlrImageUrl(item.find(TEAM_ROSTER.img).first().attr("src"))`.
   **Nunca `requireAll` aqui:** a ausência do bloco não pode derrubar o elenco inteiro.
3. `lib/vlr/schemas.ts:111-116` — `photoUrl: z.string().nullable()` em `scrapedRosterPlayerSchema`.
   **Não use `z.url()`:** `parseScraped` (`:129`) **lança**, e `scrapeRoster` grava tudo numa
   transação só — um `src` esquisito de um jogador derrubaria o elenco da organização inteira.
4. `lib/vlr/persist/rosters.ts:84-92` — `photoUrl: item.photoUrl ?? existing.photoUrl`, o mesmo
   padrão de "o scrape nunca apaga o que já está gravado" de `players.ts:81-82`.

**Testes:** contra a fixture real — `22381` devolve `https://owcdn.net/...`, `49871` devolve `null`
(é `sil.png`); e em `rosters.test.ts`, que o `??` não apaga foto existente quando o scrape vem vazio.

**Bônus de ~3 linhas, recomendado:** `lib/vlr/jobs/doctor.ts:86-91` mede só
`parseTeamRoster(html).players.length` — se o seletor da foto morrer, um `photoUrl` universalmente
`null` passa como saudável. Contar também `players.filter((p) => p.photoUrl).length` é o **único
alarme** que existiria para essa falha silenciosa.

---

## Fase 3 — backfill `--all`

**Arquivos:** `lib/vlr/jobs/sync-rosters.ts` · `scripts/vlr/rosters.ts` (+ teste).

`syncRosters(now, { all })`: com `all`, pula `findRosterTeams` (janela de −45/+30 dias) e enfileira
`select({ vlrId }).from(vlrTeam)` inteiro. No script, `boolArg("all")` — helper que **já existe**
(`scripts/vlr/run.ts`). `enqueue` (`lib/vlr/jobs/queue.ts:36-60`) já é idempotente por `(job, key)`:
rodar duas vezes não duplica. O `summary` deve imprimir quantos foram enfileirados — a fila inteira a
1,1s por requisição leva dezenas de minutos, e o operador precisa saber que não travou.

---

## Fase 4 — tipos e queries (**um commit só, e antes da UI**)

É a fase que exige disciplina de ordem: `components/home/round-highlights.tsx:145-150` monta um
literal de `RoundScorer`, então **alargar o `Pick<>` do `ScorerHighlight` antes desta fase deixa o
build vermelho**.

O padrão é o mesmo em todo lugar — `photoUrl: string | null`, obrigatório e nulável, coerente com
`availabilityNote`:

- **O gargalo bom:** `lib/team/mappers.ts:21-35` (`toDomainPlayer`) + `lib/team/types.ts:43-70`
  (`Player`). Essas duas linhas abastecem mercado, escalação, campo e os destaques do "Meu Time" de
  uma vez, porque `getTeamOverview` e `getMarketByRole` trazem a linha inteira, sem `select({})`.
- **Os quatro `select({})` explícitos**, que precisam da coluna à mão: `lib/round/queries.ts:214-220`
  (`getTopRoundScorers`), `:240-246` (`getRoundPriceMovers`), `:274-286` (`listLiveRoundScores`) e
  `lib/player/queries.ts:42-45` (`listRosterPerformances`). Os dois `groupBy` (`round/queries.ts:291`,
  `player/queries.ts:71`) **são seguros**: `photoUrl` é funcionalmente dependente de `player.id`, que
  é PK e está agrupado — é o mesmo motivo pelo qual `nickname` e `role` já passam hoje. **Não** copie
  o `min()` que `event` usa (`:283-285`): ali ele existe porque a coluna é de `match`, não de `player`.
- **Os tipos:** `RoundScorer`, `LiveRoundScore`, `PriceMover` (`lib/round/types.ts:37,50,65`),
  `PlayerMatchPerformance`, `RosterMatchPlayer` (`lib/player/types.ts:12,44`).
- **O mapeamento manual** de `lib/home/summary.ts:100-109`. O caminho da rodada fechada não precisa
  de nada — `lib/home/queries.ts:194-201` usa `{...scorer, region}` e propaga sozinho.
- **`FormSeries`** (`lib/player/form.ts:129-131,155-157`), de onde o `nickname` já vem.
- **Mate a duplicação tripla** em vez de alargá-la 3×: exportar
  `RosterChartPlayer = { playerId; nickname; photoUrl }` e usar em `app/(app)/home/page.tsx:40-44`,
  `components/home/team-performance.tsx:24` e `player-form-chart.tsx:54`, hoje um tipo anônimo
  repetido.

**Fora:** `RoundRosterEntry` (`lib/round/types.ts:27`) — `getRoundRoster` não tem consumidor de UI.

**Volume escondido:** ~11 arquivos de teste ganham uma linha nos literais de `Player`/`RoundScorer`/
`LiveRoundScore` (`components/team/*.test.tsx`, `components/market/*.test.tsx`,
`lib/market/*.test.ts`, `lib/team/score.test.ts`, `app/(app)/my-team/actions.test.ts`,
`components/home/round-highlights.test.tsx`, `lib/home/summary.test.ts`). É mecânico, mas é o maior
número de arquivos tocados do plano — não deixe para descobrir no fim.

---

## Fase 5 — o componente, e as três cópias da hachura

**Arquivos:** `components/player/player-photo.tsx` + teste (**novos**, diretório novo, no precedente
de `components/crest/`) · `next.config.ts` · `components/team/player-row.tsx` ·
`scorer-highlight.tsx` · `formation-board.tsx`.

```tsx
export type PlayerPhotoProps = {
  /** `null` para quem nunca foi visto num elenco do vlr — fica só a hachura. */
  photoUrl: string | null;
  nickname: string;
  /** Lado do quadrado em px — `next/image` exige width/height numéricos. */
  size: number;
  /** `corner` = chanfro do Valorant (padrão); `circle` = o marcador do campo. */
  shape?: "corner" | "circle";
  clip?: number;
  className?: string;
};
```

**A hachura não é um ramo `else` — é o fundo permanente da caixa.** O `<div>` externo sempre carrega
`bg-accent [background-image:repeating-linear-gradient(...)]`, e o `<Image>` entra por cima quando há
URL. Três ganhos de graça: as fotos do vlr são PNG recortado com fundo transparente (a hachura vira
o backdrop); cobre o carregamento sem precisar de `skeleton`; e se o otimizador falhar, sobra a
hachura, não um buraco.

**Dimensionamento:** `width`/`height` numéricos + `object-cover`, **nunca `fill`** — `fill` exige um
pai `relative`, e em `PlayerPortraitBadge` o pai `relative` já é o dono do `CaptainBadge` absoluto.
Com largura fixa o Next já emite srcset 1x/2x sozinho, e `sizes` sem `fill` só atrapalharia.
`shape="circle"` **precisa de `overflow-hidden`**: `rounded-full` sozinho não recorta um `<img>`
filho — o `FormationBoard` escapa disso hoje só porque a hachura é `background-image`.

**Acessibilidade:** `alt=""` + `aria-hidden` em **todos** os call sites — em todos eles o nickname
está adjacente no DOM, e sem isso o leitor de tela anuncia o nome duas vezes. Por consequência,
`getByRole("img")` não acha nada nos testes: o wrapper leva `data-slot="player-photo"` (precedente:
`data-slot="substitute"`, `player-row.tsx:238`).

**As três substituições:**

| Onde                        | O que muda                                                                                                                                        | Assinatura pública                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `player-row.tsx:72-81`      | apaga `PlayerPortrait`; `PlayerPortraitBadge` renderiza `<PlayerPhoto size={46} clip={6}>` dentro do mesmo `<div className="relative flex-none">` | **inalterada** → `market-player-row.tsx:56` não é tocado |
| `scorer-highlight.tsx:36`   | troca o `<div>` inline por `<PlayerPhoto size={52} clip={6}>`                                                                                     | `Pick<>` de `:15` ganha `"photoUrl"`                     |
| `formation-board.tsx:48-69` | separa os ramos: com jogador → `<PlayerPhoto shape="circle" size={56}>`; vaga vazia → o tracejado com `<Plus>` fica como está                     | interna                                                  |

O `FormationBoard` melhora de quebra: o `cn()` atual mistura estados de vaga-cheia e vaga-vazia num
elemento só, e separar os ramos elimina cinco guardas `player &&`.

**Não alargue o `Pick<>` de `PlayerIdentity`** (`player-row.tsx:119`): o docblock de `:112-172` é
explícito que a identidade vem **sem** retrato, porque `PlayerRow` e `MarketPlayerRow` já recebem o
retrato do irmão `PlayerPortraitBadge`. Botar `photoUrl` ali duplicaria o rosto em duas telas.

**`next.config.ts`:**

```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "owcdn.net", pathname: "/img/**", search: "" },
  ],
  minimumCacheTTL: 2_592_000, // 30 dias — foto de jogador muda uma vez por ano
}
```

`search: ""` bloqueia query string (defesa contra enumeração de chave de cache; as URLs do vlr não
têm querystring, então custa zero). **Não** passe `quality` no `<Image>`: no Next 16 `qualities`
virou `[75]` por padrão e qualquer outro valor é coagido. **Sem `unoptimized`** — otimizado, cada
foto vira webp de 48–128px, o que no `MarketSheet` (dezenas de candidatos) é a diferença entre ~2 MB
e ~100 KB no primeiro open. Se a cota de transformação um dia doer, é **uma prop** dentro de
`PlayerPhoto` — que é exatamente por que ele existe.

---

## Fase 6 — as telas que hoje não têm retrato nenhum

Cada item é independente; o único acoplado à Fase 5 é o primeiro.

| Tela                         | Arquivo                                                                                                                  | Tamanho      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------ |
| Maior pontuador do circuito  | `components/home/round-highlights.tsx:145-150` (preencher o literal)                                                     | —            |
| Valorizações/desvalorizações | `components/home/price-mover-list.tsx:29-37` — irmão de `PlayerIdentity` no `<li>`, que já é `flex items-center gap-2.5` | 28           |
| Chips de filtro do gráfico   | `components/home/filter-chip.tsx` ganha `leading?: React.ReactNode`; `team-performance.tsx:91-97` passa a foto           | 20, `circle` |
| Tooltip do gráfico           | `components/home/player-form-chart.tsx:209` (`FormTooltip`), ao lado do ponto colorido                                   | 20           |
| Resultados por partida       | `components/home/player-match-results.tsx:131-135` (`PlayerLine`)                                                        | 20           |
| Barra do mercado             | `components/market/market-summary-bar.tsx:91` — `outgoing` já é `Player` completo                                        | 20           |

Não use 16px: é o menor `imageSizes` do Next, mas um rosto em 16px é borrão; 20 cabe no `py-1.5` do
`chipClasses`.

---

## Verificação

1. `pnpm test` a cada fase; `pnpm exec tsc --noEmit` obrigatoriamente **depois da Fase 4** (é onde a
   ordem entre `RoundScorer` e o `Pick<>` do `ScorerHighlight` cobra).
2. **Valide contra banco com scrap rodado, nunca contra seed puro.** Jogadores do seed nascem com
   `vlrId: null` (`db/schema/players.ts:41-48`), `applyRoster` casa por `vlrId`
   (`lib/vlr/persist/rosters.ts:52`), e eles caem no ramo `unknown` — num banco de seed a feature
   parece não ter feito nada. **Não** tente casar por nickname: é exatamente a colisão contra a qual
   o savepoint de `rosters.ts:65-77` existe.
3. Fim a fim: `pnpm vlr:rosters --all` → `pnpm vlr:work` → no `db:studio`, `player.photo_url`
   preenchido para quem tem foto e nulo para quem cai no `sil.png`.
4. `pnpm dev` e conferir as 6 superfícies: card do mercado, lista "Resumo", campo "Time Montado",
   os dois destaques em "Meu Time", e na Home os chips, o tooltip e as valorizações.
5. **Olhe o contraste no estado misto** — a hachura `--accent`/`--muted` aparece ao redor da silhueta
   recortada; com camisa escura pode pedir um `bg-secondary` sólido no ramo _com_ foto. É decisão
   visual, cabe dentro do `PlayerPhoto`.
6. `pnpm lint` → `pnpm exec prettier --write .` → `pnpm build` (o build valida `remotePatterns`).

## Riscos e o que fica de fora

- **Dependemos do CDN do vlr.** Se o owcdn sair do ar ou mudar de host, todo mundo cai na hachura —
  degradação silenciosa, não quebra. O `logWarn` da Fase 0 e a contagem no `doctor` (Fase 2) são os
  dois avisos que existiriam.
- **Cobertura parcial é permanente, por construção.** Só jogador visto num elenco do vlr ganha foto;
  quem tem `vlrId` nulo nunca terá. O `--all` resolve o dia 1, não o caso do seed.
- **Fora de escopo (deliberado):** `vlr_team.logoUrl` — coluna morta que está no **mesmo HTML, no
  mesmo parser** (`team-roster-17037.html:359-361`), com `upsertTeams` já preparado para gravá-la
  (`lib/vlr/persist/teams.ts:38,49`). Capturá-la são ~2 linhas, mas exibir logo de organização é
  outra feature de 12 telas, e ela **colide** com o brasão gerado (`components/crest/team-crest.tsx`,
  que é explicitamente _"nunca uma imagem"_). Fica registrado aqui para o dia em que for pedida.
- **Também fora:** `Avatar`/`skeleton` do shadcn, foto dentro da `<Line>` do recharts ou no
  `<th>` do `FormTable` (é a alternativa acessível à tabela, imagem ali é ruído), `placeholder="blur"`,
  `priority`, índice em `photo_url`, e qualquer mudança em `resolvePlayer` — o scoreboard não tem
  foto para dar.
