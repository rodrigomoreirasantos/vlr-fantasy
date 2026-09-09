# Header enxuto: saldo no lugar dos pontos, logo e região clicáveis

## Context

`prompts/12_header.md` pede quatro coisas no header: tirar o item **Menu**, trocar **pontos**
por **saldo**, deixar o **logo clicável** (volta para o Início) e deixar a **região clicável**
(troca a região por ali mesmo).

Lendo o código, o pedido esbarra em dez fatos:

1. **"Menu" já é inerte.** `SECTIONS` tem cinco itens (`components/layout/app-header.tsx:29-35`)
   e o `href` é opcional (`:27`) só para sustentar esse item, que vira um `<span>` sem rota
   (`:98-105`). Removendo "Menu", as quatro seções restantes têm rota — o `href` opcional e o
   ramo do `<span>` deixam de existir.
2. **Pontos no header não vêm de prop, vêm de contexto.** `app-header.tsx:68-73` lê
   `useRegionDisplay()` (`components/layout/region-display.tsx:15-19`). O motivo está
   documentado em `region-display.tsx:22-37`: o layout **não re-renderiza na navegação**, então
   quem mantém o header em dia é cada página, via `<RegionDisplaySync>`. Trocar pontos por saldo
   é trocar o **campo do contexto**, não uma prop do header.
3. **Saldo é por região, igual aos pontos.** `fantasy_team.balance_cents`
   (`db/schema/fantasy-teams.ts:38`) tem uma linha por região — cinco saldos por usuário. Logo o
   saldo do header muda ao trocar de região exatamente pelo mesmo motivo que a pontuação muda, e
   precisa do mesmo mecanismo. O valor já está carregado: `TeamSummary.balanceCents`
   (`lib/team/types.ts:98`), que o layout logado já busca (`app/(app)/layout.tsx:31-35`).
4. **Só duas telas publicam o contexto.** `<RegionDisplaySync>` aparece em `/home`
   (`app/(app)/home/page.tsx:54-59`) e `/my-team` (`app/(app)/my-team/page.tsx:54`). `/profile` e
   `/ranking` não publicam. Como o provider mora no layout e o layout não re-renderiza numa
   navegação client-side, **trocar de região a partir do Perfil ou do Ranking deixaria o header
   mostrando a região e o saldo antigos** até um reload completo. É o bug que o pedido cria se
   ninguém olhar para essas duas telas.
5. **A troca de região já existe e é navegação de verdade.** `<RegionTabs>`
   (`components/team/region-tabs.tsx:49-72`) usa `<Link href="?region=…">`; o `proxy.ts:53-70`
   intercepta, grava o cookie `vlr.region` e propaga a escolha por header na mesma requisição.
   O header vai usar **o mesmo canal** — nada de estado paralelo.
6. **Mas o href do RegionTabs é fixo em `/my-team`** (`region-tabs.tsx:20-33`, o literal está na
   `:32`). Do header, o link precisa apontar para a **rota atual**, preservando os demais
   parâmetros — no Ranking, perder o `?c=` significa jogar o usuário para outro campeonato
   (`app/(app)/ranking/page.tsx:33-56`).
7. **Quantas regiões oferecer não é fixo.** `resolveRegion` devolve `available` com 5 ou 4
   conforme exista torneio internacional, e **clampa** `international` fechado para o default
   (`lib/team/region-selection.ts:49-55`). O layout já chama `resolveRegion()` e **descarta**
   `available` (`app/(app)/layout.tsx:30`) — é só passar adiante.
8. **O "pointer" que o prompt pede não vem de graça.** No Tailwind v4 `button` usa
   `cursor: default` (upgrade guide oficial), e o item de menu do shadcn ainda traz
   `cursor-default` no próprio estilo (o irmão instalado, `components/ui/select.tsx:120`, é a
   prova). Ou seja: `cursor-pointer` explícito no gatilho e nos itens. O logo, virando `<a href>`,
   já ganha o pointer do navegador — a classe entra mesmo assim, para deixar a intenção escrita.
9. **Tirar os pontos do header apaga a pontuação total da tela `/my-team`.** `TeamStats` mostra
   Saldo, Mercado e Região (`components/team/team-stats.tsx:31-64`) — não mostra pontos. Hoje o
   único número de pontuação total do time é o do header. Ao mesmo tempo, com o saldo permanente
   no topo, a célula "Saldo" do `TeamStats` vira a terceira exibição do mesmo número (a segunda é
   a barra do modal do mercado, `components/market/market-summary-bar.tsx:50-51`).
10. **`dropdown-menu` não está instalado.** `components/ui/` tem alert, badge, button, card,
    chart, dialog, field, input, label, scroll-area, select, separator, sheet, sonner, table e
    tabs. O `radix-ui` unificado já é dependência e `components.json` fixa o estilo `radix-nova`.

**Ponto de partida da branch:** `feat/substituicao-jogadores-mercado` está **limpa em
`230a46c`** — o trabalho do plano 11 (mercado sob demanda, `<LiveRefresh>` movido para
`components/layout/`, `market-countdown` movido para `components/market/`) foi guardado em
`stash@{0}`, junto com os arquivos não rastreados, entre eles o próprio `prompts/12_header.md`.
Todos os `arquivo:linha` deste plano foram conferidos **contra a árvore limpa**, que é o que quem
executar vai encontrar. Duas consequências práticas: (a) `components/layout/live-refresh.tsx` e
`components/market/market-countdown.tsx` ainda **não existem** aqui — eles voltam com o stash;
(b) quando o stash for reaplicado, haverá conflito nas mesmas linhas em `app/(app)/home/page.tsx`
e `app/(app)/my-team/page.tsx` (as duas telas que o plano 11 mexe e que a Fase 1 também mexe, na
linha do `<RegionDisplaySync>`). Resolver é trivial — fica `balanceCents={…}` no lugar de
`points={…}` —, mas é melhor **aplicar o stash antes** de começar este plano do que depois.

**Resultado esperado:** em qualquer tela logada, clicar em "VLRFANTASY" leva ao Início; o número
ao lado do brasão é o saldo em créditos, não mais os pontos; "Menu" sumiu da navegação; e clicar
na região abre um menu com as regiões disponíveis, que troca o time sem tirar o usuário da tela
em que ele está.

## Suposições (entrevista rodada contra o código — não houve canal com o usuário)

Este agente rodou sem `AskUserQuestion` disponível, então a entrevista foi feita contra o
código. Cada linha é uma **suposição**, não uma decisão fechada: vem com o motivo e com o
plano B, para o usuário derrubar em uma linha se discordar.

| #   | Pergunta                                                     | Suposição adotada                                                                                                                                                                     | Plano B se estiver errada                                                                                            |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Clicar na região leva para onde?                             | **Fica na tela atual** (`{rota atual}?region=…`), preservando os demais parâmetros. Trocar de região não deveria arrancar ninguém do Ranking (fato 6).                                  | Sempre `/my-team?region=…` — aí a Fase 3 inteira (Perfil e Ranking) sai do plano.                                       |
| 2   | Como o header oferece as regiões?                            | **`DropdownMenu` do shadcn** (a instalar), gatilho = o próprio chip de região, itens = `<Link>` `asChild`. Mantém a semântica de navegação do `RegionTabs` (fato 5) e o cookie do proxy. | `Select` já instalado + `router.push`, como `ChampionshipSelector` — sem arquivo novo, mas troca o chip por um combo.   |
| 3   | O que acontece com a pontuação que sai do header (fato 9)?   | **`TeamStats` troca a célula "Saldo" por "Pontos"** — nada de informação se perde e o saldo deixa de aparecer três vezes na mesma tela. É a **Fase 4, separável**.                       | Não mexer no `TeamStats` (some da `/my-team` a pontuação total), ou virar 4 células mostrando os dois.                  |
| 4   | `RegionTabs` continua na `/my-team`?                         | **Continua.** É o controle descoberto da tela e o único que funciona sem JS; o header vira atalho. Sem duplicação de lógica: os dois passam a usar o mesmo `regionHref`.                | Remover as abas e deixar só o header — uma linha a menos em `app/(app)/my-team/page.tsx`.                               |
| 5   | De onde sai a lista de regiões disponíveis?                  | **Prop do layout** (`available` de `resolveRegion`, fato 7). Congela até o próximo carregamento completo, e o clamp de `region-selection.ts:52-54` garante que um item velho não quebra. | Publicar `available` pelo contexto — exige as 4 páginas resolvendo, muito para pouco.                                  |
| 6   | Como o saldo aparece no header?                              | Mesma estrutura do que sai: valor + rótulo minúsculo — `148.2 cr`, com `<PlayerPrice>` (o mesmo componente que a barra do mercado usa para saldo) e um `sr-only` "Saldo" para leitores.  | Ícone de moeda no lugar do "cr", ou rótulo "SALDO" por extenso.                                                        |
| 7   | O contexto guarda os dois (pontos e saldo) ou troca?          | **Troca**: `RegionDisplay.points` → `RegionDisplay.balanceCents`. O contexto existe para o header e nada mais o consome (só `app-header.tsx` e os testes).                              | Guardar os dois campos, se algum dia outro consumidor precisar dos pontos.                                             |

## Fase 0 — `regionHref`: um href de região para qualquer rota

Domínio puro, testável sem banco e sem DOM. Nasce para o header e **absorve** o `hrefFor`
privado do `RegionTabs` (fato 6) — a regra de "troca só a região, preserva o resto" passa a
existir uma vez só.

**Arquivos**

- **Novo:** `lib/team/region-href.ts`
- **Novo:** `lib/team/region-href.test.ts`
- **Muda:** `components/team/region-tabs.tsx` (some o `hrefFor` local, entra o import)

```ts
// lib/team/region-href.ts
import type { TeamRegion } from "@/lib/round/regions";
import { REGION_PARAM } from "@/lib/team/region-constants";

/**
 * Os dois formatos de query que os chamadores têm em mãos: o `searchParams`
 * de uma página (Server Component) e o `useSearchParams()` do cliente
 * (`ReadonlyURLSearchParams`, que estende `URLSearchParams`).
 */
export type RegionHrefParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

export function regionHref(
  pathname: string,
  region: TeamRegion,
  params?: RegionHrefParams,
): string {
  const query = new URLSearchParams();

  const entries: [string, string][] =
    params instanceof URLSearchParams
      ? [...params.entries()]
      : Object.entries(params ?? {}).flatMap(([key, value]) =>
          value === undefined
            ? []
            : (Array.isArray(value) ? value : [value]).map(
                (item): [string, string] => [key, item],
              ),
        );

  for (const [key, value] of entries) {
    if (key === REGION_PARAM) continue;
    query.append(key, value);
  }
  // `region` sempre por último — é o que mantém o href estável
  // (`?c=abc&region=emea`) entre as abas e o header.
  query.set(REGION_PARAM, region);

  return `${pathname}?${query.toString()}`;
}
```

Nada de `any` (o `flatMap` é anotado), nenhuma cor, nenhuma data. `ReadonlyURLSearchParams`
estende `URLSearchParams` (`node_modules/next/dist/client/components/readonly-url-search-params.d.ts:10`),
então o `instanceof` cobre o caso do cliente.

Em `region-tabs.tsx`, `hrefFor(region, params)` vira
`regionHref("/my-team", region, params)`. A ordem dos parâmetros é a mesma de hoje, então o teste
existente (`components/team/region-tabs.test.tsx:31-44`, que espera `/my-team?ordem=preco&region=emea`)
continua passando sem edição — é o sinal de que a extração não mudou comportamento.

**Testes** (`lib/team/region-href.test.ts`, ambiente node, sem DOM):

- sem parâmetros: `regionHref("/home", "emea")` → `/home?region=emea`;
- preserva os demais e troca só a região, a partir de um `Record`;
- preserva a partir de um `URLSearchParams` (`?c=abc`) → `/ranking?c=abc&region=emea`;
- `region` já presente não duplica (`?region=americas` → só `region=emea`);
- valor repetido (`?tag=a&tag=b`) sobrevive nos dois formatos.

**Como verificar:** `pnpm test lib/team/region-href.test.ts components/team/region-tabs.test.tsx`.

## Fase 1 — o contexto passa a carregar o saldo

**Arquivos**

- **Muda:** `components/layout/region-display.tsx`
- **Muda:** `components/layout/region-display.test.tsx`
- **Muda:** `app/(app)/layout.tsx`
- **Muda:** `app/(app)/home/page.tsx`, `app/(app)/my-team/page.tsx` (os dois publicadores atuais)

`RegionDisplay` troca o campo (suposição 7), com o comentário atualizado para dizer **por que**
saldo mora aqui e não em prop — o mesmo motivo dos pontos (fato 3):

```ts
export type RegionDisplay = {
  region: TeamRegion;
  /** Saldo do time **daquela** região, em centavos (`fantasy_team.balance_cents`). */
  balanceCents: number;
};
```

`RegionDisplaySync` passa a receber `balanceCents`; a guarda de igualdade
(`region-display.tsx:83-87`) compara `current.balanceCents === balanceCents` — **manter essa
guarda**, ela é o que impede o laço infinito de re-render descrito no arquivo.

- `app/(app)/layout.tsx:30` passa a desestruturar `const { region, available } = await resolveRegion();`
  (suposição 5), semeia `initial={{ region: overview.region, balanceCents: overview.summary.balanceCents }}`
  e passa `available={available}` ao `<AppHeader>`.
- `app/(app)/home/page.tsx:54-59` e `app/(app)/my-team/page.tsx:54`: `points={…}` vira
  `balanceCents={overview.summary.balanceCents}` / `balanceCents={summary.balanceCents}`.

**Testes** (`components/layout/region-display.test.tsx`): os quatro casos existentes seguem
iguais em intenção, trocando `points` por `balanceCents` no consumidor de mentira e nas
asserções. Vale acrescentar um caso novo, que é o que o produto ganha nesta fase:

- "publicar outro saldo na mesma região atualiza o header" — o cenário de compra/venda, em que
  `revalidatePath("/my-team")` (`app/(app)/my-team/actions.ts:130`) re-renderiza a página e o
  sync republica só o saldo.

**Como verificar:** `pnpm test components/layout` e `pnpm exec tsc --noEmit` (o compilador acha
sozinho todos os call sites de `points`).

## Fase 2 — o header: Menu fora, saldo dentro, logo e região clicáveis

**Arquivos**

- **Novo:** `components/ui/dropdown-menu.tsx` — instalado, não escrito à mão:
  `pnpm exec shadcn add dropdown-menu`. Conferir depois da instalação que ele importa de
  `radix-ui` (unificado), como `components/ui/select.tsx:4` — é o estilo `radix-nova` do
  `components.json`. Nenhuma cor literal deve entrar no arquivo gerado.
- **Novo:** `components/layout/region-switcher.tsx`
- **Novo:** `components/layout/region-switcher.test.tsx`
- **Muda:** `components/layout/app-header.tsx`
- **Muda:** `components/layout/app-header.test.tsx`

### `components/layout/app-header.tsx`

1. `SECTIONS` fica com quatro itens; `type Section` passa a ter `href: string` **obrigatório**
   e o ramo `if (!href) return <span>…` (`:98-105`) some, junto com o import `Menu` do lucide.
   O `map` vira só o `<Link>`.
2. O logo vira link:

```tsx
<Link
  href="/home"
  className="cursor-pointer text-lg font-bold tracking-tight text-primary"
>
  VLR<span className="text-foreground">FANTASY</span>
</Link>
```

3. O bloco de pontos (`:68-73`) vira saldo, reusando o componente que já formata crédito
   (nenhum componente formata dinheiro na mão — `lib/market/money.ts`):

```tsx
<span className="flex items-baseline gap-1">
  <span className="sr-only">Saldo</span>
  <PlayerPrice priceCents={balanceCents} className="text-base font-extrabold" />
  <span
    aria-hidden
    className="text-[11px] font-semibold text-muted-foreground uppercase"
  >
    cr
  </span>
</span>
```

`formatScore` sai dos imports do header (continua em uso em `components/team/player-score.tsx`).

4. O chip de região estático (`:75-85`) vira `<RegionSwitcher current={region} available={available} />`.
5. Nova prop `available: readonly TeamRegion[]`, com comentário explicando que ela vem do layout
   e por que congelar é aceitável (o clamp de `resolveRegion`, fato 7).

### `components/layout/region-switcher.tsx`

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { regionColor, regionLabel, type TeamRegion } from "@/lib/round/regions";
import { regionHref } from "@/lib/team/region-href";

export function RegionSwitcher({
  current,
  available,
}: {
  current: TeamRegion;
  available: readonly TeamRegion[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Trocar de região (${regionLabel(current)})`}
        className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase transition-opacity hover:opacity-80"
        style={{ color: regionColor(current) }}
      >
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ backgroundColor: regionColor(current) }}
        />
        {regionLabel(current)}
        <ChevronDown aria-hidden className="size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        {available.map((region) => (
          <DropdownMenuItem key={region} asChild className="cursor-pointer">
            <Link
              href={regionHref(pathname, region, searchParams)}
              prefetch={false}
              aria-current={region === current ? "page" : undefined}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: regionColor(region) }}
              />
              {regionLabel(region)}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Detalhes que **não** são opcionais:

- `cursor-pointer` no gatilho **e** nos itens — fato 8. É literalmente a task do prompt.
- `prefetch={false}`, pelo mesmo motivo documentado em `region-tabs.tsx:41-44`: prefetchar as
  cinco regiões puxaria cinco páginas dinâmicas por passar o mouse.
- Cor só por `regionColor()` (que devolve `var(--chart-N)`), nunca literal — regra do `CLAUDE.md`.
- `aria-current="page"` na região atual, igual às abas.

### Testes

`components/layout/region-switcher.test.tsx` (RTL, `userEvent`; os stubs de Radix já existem em
`vitest.setup.ts:20-43`, que é como `Sheet` e `Select` são testados hoje):

- abre pelo gatilho ("Trocar de região (Americas)") e lista **4** regiões sem torneio
  internacional (`LEAGUE_REGIONS`) e **5** com (`TEAM_REGIONS`);
- cada item aponta para a **rota atual**: com `usePathname` = `/ranking` e `useSearchParams` =
  `c=abc`, o item EMEA tem `href="/ranking?c=abc&region=emea"` — o caso que prova o fato 6;
- a região atual está marcada com `aria-current="page"`.

`components/layout/app-header.test.tsx`:

- adicionar `useSearchParams: () => new URLSearchParams()` ao mock de `next/navigation`
  (`:6-9`) — sem isso o header quebra ao montar o switcher;
- **remover** o teste "itens sem rota não são links" (`:94-102`) e pôr no lugar
  "não existe mais o item Menu": `queryByRole("link", { name: /menu/i })` e
  `queryByText("Menu")` ambos ausentes;
- "mostra o nome do time, o brasão, os pontos e a saudação" (`:104-114`) vira "…, **o saldo**, …":
  com `balanceCents: 14_820`, `getByText("148.2")` presente e `queryByText("pts")` ausente;
- novo: o logo é link para `/home` — `getByRole("link", { name: /vlrfantasy/i })` com
  `href="/home"`;
- "mostra a região e a pontuação do time em exibição" (`:116-122`) vira região + saldo.

**Como verificar:** `pnpm test components/layout`, `pnpm lint`, e na tela: abrir `/my-team`,
clicar na região do topo, escolher EMEA, ver o elenco, o saldo do header e as abas mudarem
juntos; clicar no logo e cair no Início.

## Fase 3 — as duas telas que não publicavam (o bug que o pedido cria)

Sem esta fase, trocar a região a partir do Perfil ou do Ranking muda a URL e o cookie, mas o
header continua exibindo a região e o saldo anteriores (fato 4) — a tela passa a mentir.

**Arquivos**

- **Muda:** `app/(app)/profile/page.tsx`
- **Muda:** `app/(app)/ranking/page.tsx`

`/profile` já tem tudo em mãos (`:45-53`): basta uma linha logo no começo do `return` (`:87`),
dentro do `<main>`:

```tsx
<RegionDisplaySync
  region={overview.region}
  balanceCents={overview.summary.balanceCents}
/>
```

`/ranking` não resolve região nenhuma hoje. Ele passa a chamar, **com os mesmos argumentos do
layout** (`app/(app)/layout.tsx:31-35`) — é o que faz a memoização por request de
`getTeamOverview` (`lib/team/queries.ts:181`) devolver a consulta já feita, sem ida extra ao
banco:

```tsx
const { region } = await resolveRegion();
const overview = await getTeamOverview(
  session.user.id,
  session.user.username ?? session.user.name,
  region,
);
const regionSync = overview ? (
  <RegionDisplaySync
    region={overview.region}
    balanceCents={overview.summary.balanceCents}
  />
) : null;
```

`{regionSync}` entra nos **dois** `return` da página — o de "sem campeonatos" (`:42-49`) e o
principal (`:61`). Esquecer o primeiro é justamente o bug que esta fase existe para fechar.

Sem `db.transaction` aqui: nada nesta fase escreve, é leitura de saldo já existente.

**Testes:** são páginas (Server Components assíncronos), fora do alvo da suíte de componentes.
A verificação é manual e está descrita abaixo. O comportamento em si — "publicar muda o header" —
já está coberto pelo teste do contexto (Fase 1).

**Como verificar:** `pnpm dev`, abrir `/ranking?c=<id de um campeonato>`, trocar a região pelo
header e conferir três coisas: o campeonato selecionado continua o mesmo (o `?c=` sobreviveu), a
região do header mudou, o saldo do header mudou. Repetir em `/profile`.

## Fase 4 — `TeamStats`: "Pontos" no lugar de "Saldo" (separável)

Consequência do fato 9, e a única parte do plano que o prompt não pediu — está isolada aqui de
propósito, para poder ser descartada sem tocar no resto.

**Arquivos**

- **Muda:** `components/team/team-stats.tsx`
- **Muda:** `components/team/team-stats.test.tsx`

A célula "Saldo" (`:31-38`) vira "Pontos", com `formatScore(points)` de `@/lib/team/score` e a
mesma classe `text-info tabular-nums`; `formatCredits` sai do import. Mercado e Região não mudam.

**Testes:** o caso "mostra o saldo formatado" (`team-stats.test.tsx:39-43`) vira "mostra os
pontos do time": `makeSummary({ points: 42 })` → `getByText("42.0")`, e `queryByText("123.4")`
ausente. Os outros dois casos seguem iguais.

**Como verificar:** `pnpm test components/team/team-stats.test.tsx` e olhar a `/my-team`: saldo no
topo (header), pontos no painel — cada número aparecendo uma vez só.

## Riscos e o que fica de fora

- **`useSearchParams` no header.** O header vive no layout; se alguma rota de `app/(app)/` fosse
  pré-renderizada, a árvore de cliente até o `<Suspense>` mais próximo passaria a renderizar só
  no cliente (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`,
  seção "Prerendering"). Hoje isso **não** acontece: as quatro páginas e o layout chamam
  `auth.api.getSession({ headers: await headers() })`, o que as torna dinâmicas. Se algum dia o
  `pnpm build` reclamar de "URL data in a Client Component outside of Suspense", há duas saídas:
  envolver o `<RegionSwitcher>` num `<Suspense>` no layout, ou montar o href só com
  `usePathname` — perdendo a preservação do `?c=`.
- **`available` congelado.** Vindo do layout, a lista de regiões só se atualiza num carregamento
  completo. Se um Masters começar com a aba aberta, o menu demora a oferecer "Internacional"; se
  terminar, o item pode continuar visível e o clique cai no default por causa do clamp
  (`lib/team/region-selection.ts:52-54`). Nenhum dos dois quebra nada — só não é instantâneo.
- **`app/(app)/template.tsx` foi considerado e descartado.** Um template re-renderiza a cada
  navegação e resolveria a Fase 3 num arquivo só, mas ele **remonta a subárvore** a cada
  navegação e a cada troca de `?region=` — o que derrubaria estado de cliente como o modal do
  mercado aberto e o intervalo do `<LiveRefresh>` (o auto-refresh do plano 11, hoje no stash). Preço alto demais para economizar
  três linhas.
- **Trocar região do Perfil/Ranking não muda nada visível além do header.** É esperado: nome e
  brasão são do usuário, não da região (`fantasy_identity`), e o Ranking recorta por campeonato,
  que tem região própria. O menu está ali para o usuário poder escolher com qual time ele segue
  navegando, não para reconfigurar essas duas telas.
- **Sem JS, a troca de região continua só na `/my-team`.** O gatilho do menu é um botão; as abas
  do `RegionTabs` (suposição 4) permanecem como o caminho que funciona sem JS.
- **Não entra neste plano:** menu hambúrguer / navegação mobile no lugar do item "Menu" removido
  (o header segue `flex-wrap`, como hoje), qualquer mudança em pontuação, mercado, saldo no banco
  ou migrations — nada aqui escreve no banco.
