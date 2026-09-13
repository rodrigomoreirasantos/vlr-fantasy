# Tour guiado: passo a passo com destaque, com foco no mercado e no fechamento

## Contexto

Pedido do Rodrigo (`prompts/23_step_by_step.md`): um **passo a passo visual** que passe por todas as abas
e seções, **destacando** cada parte da tela, com **Próximo/Voltar**, **pouquíssimo texto**, foco em
**mercado e fechamento do mercado**, e que o usuário possa pedir **a qualquer momento**, "no header ou
junto com a opção de sair, no mesmo modal".

**Resultado esperado:** no primeiro acesso, a tela escurece e aparece um cartão chanfrado "Bem-vindo ao
VLR Fantasy". Em "Começar", um recorte vermelho destaca uma parte da tela por vez: saldo, região, próximos
jogos, **o horário em que o mercado fecha**, pontos, escalação, capitão, teto, relógio do mercado, ranking,
perfil. Cada passo tem uma frase curta, "3 de 13", Voltar/Próximo, e o tour troca de aba sozinho. Terminado
ou pulado, não volta mais, em nenhum aparelho. Quem quiser rever abre o menu da conta e clica em
"Ver tutorial", logo acima de "Sair".

## Fatos verificados

1. **As quatro abas são páginas diferentes.** `components/layout/app-header.tsx:18-23`: Início `/home`,
   Perfil `/profile`, Escalação `/my-team`, Ranking `/ranking`. O tour precisa **navegar** e **esperar o
   alvo aparecer**: não existe `loading.tsx` em `app/(app)/`, então cada troca espera o servidor renderizar.
2. **O layout logado sobrevive à navegação, e é ele que pode guardar o tour.** `app/(app)/layout.tsx:58-76`
   já envolve header e páginas em `TimezoneProvider` e `RegionDisplayProvider`. Doc do Next 16: *"On
   navigation, layouts preserve state, remain interactive, and do not rerender"*
   (`node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:43`).
3. **O "mesmo modal" do "Sair" existe e tem espaço.** `components/layout/account-menu.tsx:72-95`:
   `DropdownMenuContent` com rótulo, separador e um item "Sair". O plano 21 deixou o separador pronto
   para o menu crescer.
4. **O header não tem navegação mobile.** `app-header.tsx:54` é só `flex-wrap` (plano 12 tirou hambúrguer
   do escopo). Em telefone os blocos empilham, mas **todos os alvos do header continuam visíveis**: saldo
   (`:70-82`), região (`:84`), gatilho da conta (`:111`, que abaixo de `sm` vira só o monograma).
5. **Não há lib de tour nem Popover instalados, mas o Popover do Radix já está no `node_modules`.** O pacote
   `radix-ui@^1.6.7` traz `@radix-ui/react-popover@1.1.23`, e o `PopoverAnchor` aceita `virtualRef`
   (`@radix-ui/react-popper/dist/index.d.ts:18`): dá para ancorar o cartão em qualquer elemento ou num
   retângulo calculado. `pnpm dlx shadcn@latest add popover` não acrescenta dependência npm.
6. **Comparação das libs (Context7 + `npm view`, 2026-09-12):**

   | Lib | Versão / licença | React 19 | Atravessa rotas | A11y | Custo aqui |
   | --- | --- | --- | --- | --- | --- |
   | react-joyride | 3.2.0, MIT | sim | `before` hook + `targetWaitTimeout` | foco preso, restaura foco | +8 dependências novas; spotlight/overlay com estilo próprio |
   | driver.js | 1.8.0, MIT, zero deps | n/a (vanilla) | manual | Esc e setas; sem foco preso documentado | cartão é DOM imperativo, fora do React/shadcn |
   | nextstepjs | 2.3.0, MIT | sim | `nextRoute`/`prevRoute` nativos | Esc e setas | exige `motion@>=11` como peer |
   | shepherd.js / intro.js | 15.3.0 / 8.5.0, **AGPL-3.0** | — | — | — | licença incompatível: **descartadas** |

7. **O mercado tem regra própria, e o texto do tour tem de bater com ela.** Fecha **por campeonato**, **1h
   antes do primeiro jogo do dia** (`lib/market/window.ts:23` `MARKET_CLOSE_LEAD_MS`, `:41-48`
   `marketGroupKey`); trava até o dia seguinte (`lib/market/lock.ts:14-22`). A Home mostra "Mercado fecha
   HH:mm" por jogo (`components/home/match-schedule.tsx:194`, `MarketCell` `:227-250`); `/my-team` mostra
   aberto/fechado e quanto falta (`components/team/team-stats.tsx:40-55`).
8. **Pontuar não mexe no saldo, e o CLAUDE.md sugere o contrário.** O fechamento de rodada só **corta** o
   caixa pelo teto (`db/close-round.ts:147-162`); o que muda com o desempenho é o **preço** do jogador
   (`lib/scoring/pricing.ts`). O passo do saldo fala de valorização. Números citados vêm das constantes:
   capitão 2× (`lib/scoring/team.ts:10`), teto 360.0 cr (`lib/market/budget.ts:13`), pontos de kills,
   assistências, first kills e vitória de mapa (`lib/scoring/scout.ts:44-62`).
9. **Algumas seções só existem em certos estados:** `UpcomingMatches` sem jogos vira painel vazio
   (`upcoming-matches.tsx:50-58`); `/ranking` sem campeonato renderiza `EmptyChampionships`
   (`ranking/page.tsx:97-105`); o "C" de capitão só existe com mercado aberto e jogador na vaga
   (`roster-panel.tsx:250`, `formation-board.tsx:107-126`). Alvo que depende de estado precisa de plano B.
10. **Duas telas se atualizam sozinhas.** `LiveRefresh` em `/home` e `/my-team`, e o `TimezoneSync`
    (`components/layout/timezone.tsx`) chamam `router.refresh()`. O estado cliente é preservado, mas o
    retângulo do alvo pode mudar: o destaque tem de **re-medir** enquanto o tour roda.
11. **Nenhuma seção tem âncora estável.** `Panel` não repassa atributos (`components/layout/panel.tsx:16-33`).
    Os alvos precisam de `data-tour` explícito, tipado.
12. **"Já viu o tour" tem lugar natural no banco, sem consulta extra.** `fantasy_identity`
    (`db/schema/fantasy-identity.ts:18-48`) é a linha do usuário, fora do território do better-auth.
    `loadTeamOverview` já a carrega (`lib/team/queries.ts:130`) e o layout já chama `getTeamOverview`.
13. **Migration exige conferir o banco-alvo.** O `.env` tem três linhas `DATABASE_URL` (Docker e produção
    comentadas; ativa = Supabase de dev `ydlgzvtxijbylskpaamf`). A regra do plano 23 (`:189-191`) vale:
    aplicar no dev → conferir → aplicar na produção → só então deployar o código que lê a coluna.
14. **Os stubs de jsdom para Radix já existem.** `vitest.setup.ts:20-43` cobre `ResizeObserver`, pointer
    capture e `scrollIntoView`: Popover e overlay são testáveis com RTL sem infraestrutura nova.
15. **Git.** A branch atual é `feat/horario-jogos-fuso-usuario` (plano 24, PR ainda não mergeado). Este
    plano mexe em `app/(app)/layout.tsx`, `upcoming-matches.tsx` e `match-schedule.tsx`, os mesmos
    arquivos do plano 24.

## Roteiro do tour (13 passos)

Regra de escrita, travada em teste: **título ≤ 28 caracteres, texto ≤ 120**, uma ideia por passo, uma
parada por **decisão que o usuário toma**. Seções autoexplicativas (Destaques da rodada, Maior/Menor
pontuador, Meus campeonatos, abas de região) ficam de fora de propósito.

| # | Tela | Alvo (`data-tour`) | Onde nasce o atributo | Título | Texto |
| --- | --- | --- | --- | --- | --- |
| 1 | qualquer | — (centralizado) | — | Bem-vindo ao VLR Fantasy | Monte um time com 5 pros de Valorant e pontue com as partidas reais deles. Leva 1 minuto. |
| 2 | `/home` | `saldo` | `app-header.tsx:70` | Seu saldo | Créditos para contratar. Jogador que joga bem valoriza e rende mais na venda. |
| 3 | `/home` | `regiao` | `region-switcher.tsx:29` | Um time por região | Você tem um time em cada liga. Troque aqui qual está vendo. |
| 4 | `/home` | `proximos-jogos` | `upcoming-matches.tsx:50` e `:65` | Próximos jogos | A agenda do circuito, já no seu fuso horário. |
| 5 | `/home` | `fechamento-mercado` (reserva: `proximos-jogos`) | `match-schedule.tsx:194`, só no `MarketCell` da linha `isNext` | Fique de olho no fechamento | O mercado de cada campeonato fecha 1h antes do 1º jogo do dia. Depois, só no dia seguinte. |
| 6 | `/home` | `desempenho` | `team-performance.tsx:63` | Seus pontos | Kills, assistências, first bloods e vitórias viram pontos. Veja aqui quem rendeu. |
| 7 | `/my-team` | `escalacao` | `roster-panel.tsx:207` | Sua escalação | Toque numa vaga para abrir o mercado: contrate, troque ou venda. |
| 8 | `/my-team` | `capitao` | `roster-panel.tsx:243` | Capitão | Toque no C de um jogador: o capitão pontua 2×. |
| 9 | `/my-team` | `orcamento` | `budget-bar.tsx:47` | Teto do patrimônio | Saldo + elenco não passam de 360.0 cr. Os mais caros nunca cabem todos juntos. |
| 10 | `/my-team` | `relogio-mercado` | `team-stats.tsx:40` | Quanto falta | Aqui você vê se o mercado está aberto e quando fecha. Não deixe para a última hora. |
| 11 | `/ranking` | `campeonatos` | `ranking/page.tsx:128` **e** `empty-championships.tsx:17` | Campeonatos | Crie uma liga, convide amigos e dispute a pontuação da rodada. |
| 12 | `/profile` | `perfil` | `profile/page.tsx:97` | Seu perfil | Troque nome e brasão e adicione amigos pelo @ para chamar aos seus campeonatos. |
| 13 | `/profile` | `conta` | `account-menu.tsx:53` | Quer rever? | O tutorial fica aqui no seu menu, junto de Sair. Boa rodada! |

"1h", "2×" e "360.0" são **interpolados**: `MARKET_CLOSE_LEAD_MS / 3_600_000`, `CAPTAIN_MULTIPLIER`,
`formatCredits(MAX_PATRIMONY_CENTS)`. Se a regra mudar, o tour muda junto.

## Decisões tomadas neste plano (decorrem do código)

| # | Decisão |
| --- | --- |
| 1 | O tour mora num **provider cliente dentro do layout logado** (fato 2): um só estado para as quatro páginas, navegação via `router.push`, nada em `proxy.ts`. |
| 2 | Alvos só por `data-tour`, com união de tipos `TourTarget`. Nome errado não compila (fato 11). |
| 3 | Todo número de regra no texto vem da constante de domínio (fato 8). |
| 4 | Alvo ausente depois da espera: o passo **aparece mesmo assim**, centralizado e sem recorte. Nunca trava nem pula sozinho. Passo com reserva tenta o reserva antes (fato 9). |
| 5 | O destaque **re-mede a cada frame** (`requestAnimationFrame`) enquanto roda e procura o alvo de novo se saiu do DOM. Cobre `LiveRefresh`, `TimezoneSync`, scroll e resize (fato 10). |
| 6 | Durante o tour a página **não é clicável**: `Popover` com `modal` (Radix prende foco e bloqueia clique fora). Sem isso, clicar numa vaga abriria o `MarketSheet` no meio da explicação. |
| 7 | A11y: cartão `role="dialog"` com `aria-labelledby`/`aria-describedby`; título/texto/progresso em `aria-live="polite"`; foco em "Próximo" a cada passo; `Esc` = pular; `←`/`→` = voltar/próximo; `motion-reduce:transition-none`. |
| 8 | Nenhuma escrita mexe em saldo (sem `db.transaction`). A única escrita marca o tour como visto, é idempotente e usa `authActionClient` do `next-safe-action` (`lib/safe-action.ts`). Sem formulário → sem RHF/Zod. |
| 9 | Nenhuma cor hard-coded: overlay `fill-background/80`, contorno `stroke-primary`, cartão `bg-popover`/`ring-border`, destaque `text-primary`. Skill `frontend-design` obrigatória na Fase 2. |
| 10 | Primeiro passo é convite ("Começar"/"Agora não"); "Agora não", `Esc`, "Pular" e "Concluir" **marcam como visto**. |
| 11 | Gatilho "Ver tutorial" **só no menu da conta**, acima do "Sair" (é o "mesmo modal" do pedido; o header já não cabe em telefone). |
| 12 | Último botão "Concluir": fecha, marca visto, **fica onde está**. Pedido fora da Home: o convite abre ali; "Começar" leva a `/home`. |
| 13 | Navegação alheia (voltar do navegador) com tour aberto → encerra e marca visto. Clique no escuro fora do cartão → não faz nada. |

## Decisões confirmadas com o Rodrigo (2026-09-12)

**A, B e C confirmadas conforme a recomendação:** tour próprio com Popover shadcn, coluna
`tour_completed_at` no banco, e abertura automática uma vez para todos (novos e existentes).
**D (branch)** segue a recomendação abaixo.

| # | Pergunta | **Recomendação** | Alternativa e custo |
| --- | --- | --- | --- |
| A | Lib pronta ou própria? | **Própria com `Popover` do shadcn + overlay SVG chanfrado.** Zero dependência nova; cartão React com `Button` shadcn e identidade Valorant real; foco preso/Esc/portal/colisão vêm do Radix, já testável. ~4 arquivos pequenos. | **react-joyride v3**: maduro, já espera alvo e prende foco; +8 deps, override de estilo inline para o tema. Troca só a Fase 2 (`useJoyride({ tooltipComponent })`). |
| B | Onde guardar "já viu"? | **Coluna `tour_completed_at timestamptz` nullable em `fantasy_identity`.** Vale em qualquer aparelho, sem consulta extra; migration aditiva. | **localStorage**: sem migration; reabre em cada navegador/aparelho. Troca a Fase 1 por `lib/tour/storage.ts`. |
| C | Primeiro acesso abre sozinho — inclusive para usuários já existentes? | **Sim, uma vez, para todos** (coluna nasce `null`, sem backfill): o motivo do pedido (fechamento do mercado) vale para quem já joga. | Só contas novas: exige backfill por script. Não abrir sozinho: ninguém descobre o tour. |
| D | Branch | **`feat/tour-guiado` a partir de `main` depois do merge do PR do plano 24** (fato 15). Se o PR 24 ainda estiver aberto: partir de `feat/horario-jogos-fuso-usuario` e rebasear após o merge. | Partir da `main` atual: conflito certo em três arquivos. |

## Fase 0 — Domínio puro: passos, máquina de estados e geometria

Sem React, sem banco. `// @vitest-environment node` quando não houver DOM (como `lib/round/day.test.ts:1`).

**Arquivos novos:** `lib/tour/targets.ts`, `lib/tour/steps.ts`, `lib/tour/machine.ts`, `lib/tour/geometry.ts`
e os três `*.test.ts` correspondentes.

```ts
// lib/tour/targets.ts
export const TOUR_TARGETS = [
  "saldo", "regiao", "proximos-jogos", "fechamento-mercado", "desempenho",
  "escalacao", "capitao", "orcamento", "relogio-mercado", "campeonatos",
  "perfil", "conta",
] as const;
export type TourTarget = (typeof TOUR_TARGETS)[number];
export function tourTarget(id: TourTarget) { return { "data-tour": id } as const; }
export function tourSelector(id: TourTarget): string { return `[data-tour="${id}"]`; }
```

```ts
// lib/tour/steps.ts
export type TourRoute = "/home" | "/my-team" | "/ranking" | "/profile";
export type TourStep = {
  id: string;
  route: TourRoute | null;     // null = abre onde o usuário estiver (só o convite)
  target: TourTarget | null;   // null = cartão centralizado
  fallback?: TourTarget;       // tentado quando `target` não aparece
  title: string;
  body: string;
};
export const TOUR_STEPS: readonly TourStep[] = [ /* os 13 do roteiro */ ];
```

```ts
// lib/tour/machine.ts
export type TourState = { status: "idle" } | { status: "running"; index: number };
export type TourAction = { type: "start" } | { type: "next" } | { type: "back" } | { type: "close" };
/** `next` no último e `close` levam a `idle`; quem observa running → idle marca como visto. */
export function tourReducer(state: TourState, action: TourAction, total: number): TourState;
```

```ts
// lib/tour/geometry.ts
export type Rect = { top: number; left: number; width: number; height: number };
export function spotlightRect(target: Rect, viewport: { width: number; height: number }, padding?: number): Rect;
/** 6 pontos do polígono chanfrado — mesma forma do `clip-corner` (`app/globals.css:132-141`). */
export function chamferPoints(rect: Rect, clip?: number): string;
export function cardPlacement(target: Rect | null, viewport: { width: number; height: number }, cardHeight?: number):
  "bottom" | "top" | "docked" | "center";
```

**Testes**
- `steps.test.ts`: 13 passos com `id` único; título ≤ 28 e texto ≤ 120; só o passo 1 tem `route`/`target`
  `null`; toda rota pertence às 4 abas; rotas contíguas (sem pingue-pongue); `fechamento-mercado` contém
  "1h" e tem `fallback: "proximos-jogos"`; `capitao` contém `${CAPTAIN_MULTIPLIER}×`; `orcamento` contém
  `formatCredits(MAX_PATRIMONY_CENTS)`; nenhum texto liga "saldo" a "pontos" (trava do fato 8).
- `machine.test.ts`: `start` → 0; `next`/`back` andam; `back` no 0 fica; `next` no último → `idle`;
  `close` → `idle`; ação em `idle` que não seja `start` não faz nada.
- `geometry.test.ts`: padding aplicado e recortado à viewport; `chamferPoints` com 6 pares; alvo no topo →
  `bottom`; no rodapé → `top`; 90% da altura em 390×844 → `docked`; `null` → `center`.

**Verificar:** `pnpm test lib/tour` e `pnpm exec tsc --noEmit`.

## Fase 1 — Persistência: coluna, query e Server Action

**Arquivos**
- **muda** `db/schema/fantasy-identity.ts`: `tourCompletedAt: timestamp("tour_completed_at", { withTimezone: true })`, nullable, sem default, com comentário.
- **nasce** `drizzle/0020_*.sql` via `pnpm db:generate` (esperado: um `ALTER TABLE ... ADD COLUMN`). **Conferir, nunca editar.**
- **novo** `lib/tour/queries.ts`
- **muda** `lib/team/queries.ts:57-66` (`TeamOverview` ganha `tourCompletedAt: Date | null`) e o `return` de `loadTeamOverview` (`:162`)
- **novo** `app/(app)/actions.ts` + `app/(app)/actions.test.ts`

```ts
// lib/tour/queries.ts — Drizzle, sem transação (não toca saldo)
export async function markTourCompleted(userId: string, q: Querier = db): Promise<void> {
  await q
    .update(fantasyIdentity)
    .set({ tourCompletedAt: new Date() })
    // Idempotente: rever pelo menu não reescreve a primeira data.
    .where(and(eq(fantasyIdentity.userId, userId), isNull(fantasyIdentity.tourCompletedAt)));
}
```

```ts
// app/(app)/actions.ts
"use server";
import { authActionClient } from "@/lib/safe-action";
import { markTourCompleted } from "@/lib/tour/queries";

/** Sem input: o usuário vem da sessão. Sem revalidatePath: o provider já fechou o tour localmente. */
export const completeTour = authActionClient.action(async ({ ctx }) => {
  await markTourCompleted(ctx.userId);
  return { success: true as const };
});
```

**Testes** (padrão de `app/(app)/profile/actions.test.ts`: mock de `@/lib/auth`, `next/headers`,
`@/lib/tour/queries`; banco mockado): com sessão chama `markTourCompleted("user-1")` e devolve
`{ success: true }`; sem sessão devolve o `serverError` de sessão expirada e não chama a query.

**Verificar:** `pnpm test "app/(app)/actions.test.ts" lib/tour`, `tsc`, `lint`; `pnpm db:generate` e
conferir o SQL; `pnpm db:migrate` **só após conferir o banco do `.env`** (fato 13).

## Fase 2 — O motor: Popover, recorte e provider

**Obrigatório:** skill `frontend-design`; `pnpm dlx shadcn@latest add popover` (se não exportar
`PopoverAnchor`, acrescentar o wrapper no próprio `components/ui/popover.tsx`).

**Arquivos**
- **nasce** `components/ui/popover.tsx` (CLI shadcn)
- **novo** `lib/tour/wait-for-target.ts` + teste (jsdom)
- **novo** `components/tour/tour-provider.tsx` (`"use client"`): contexto, reducer, navegação, persistência
- **novo** `components/tour/tour-spotlight.tsx`: SVG fixo com máscara
- **novo** `components/tour/tour-card.tsx`: o cartão
- **novo** `components/tour/tour-provider.test.tsx`

**Comportamento**
- `waitForTarget(selector, { timeoutMs = 8000, signal })`: resolve na hora se existe; senão
  `MutationObserver` em `document.body` até aparecer, estourar (`null`) ou abortar.
- `TourProvider({ autoStart, children })`: `useReducer(tourReducer)`; `useTour(): { start(); running }`
  que **lança fora do provider** (como `useRegionDisplay`). Auto-início em efeito de montagem com `ref`
  "já iniciou" (um `router.refresh()` antes da action gravar não pode reabrir). A cada passo:
  `router.push(step.route)` se a rota difere de `usePathname()` → `waitForTarget` do alvo, depois do
  reserva, depois `null` → `scrollIntoView({ block: "center" })` → publica o elemento. Enquanto espera,
  o cartão mostra o título + "Carregando…" com `aria-busy`; trocar de passo aborta a espera anterior.
  Transição running → idle dispara `completeTour` via `useAction` (erro silencioso). Mudança de rota
  que o provider não iniciou (flag em `ref`) → `close`.
- `TourSpotlight({ element })`: `<svg className="pointer-events-none fixed inset-0 z-50 size-full">` com
  `<mask>` (retângulo branco + polígono preto em `chamferPoints(spotlightRect(...))`), `rect`
  `fill-background/80` mascarado e `polygon` `fill-none stroke-primary` 2px. Mede com
  `getBoundingClientRect()` em loop `requestAnimationFrame` só enquanto montado; re-busca se
  `!element.isConnected`. Sem elemento, overlay sem furo.
- `TourCard`: `<Popover open modal>` + `<PopoverAnchor virtualRef={anchorRef} />` (elemento alvo, ou
  `{ getBoundingClientRect }` 0×0 no centro/rodapé conforme `cardPlacement`). `PopoverContent` com
  `side` de `cardPlacement`, `collisionPadding={16}`,
  `className="z-[60] w-[min(20rem,calc(100vw-2rem))] clip-corner [--clip:12px] bg-popover ring-1 ring-border"`,
  `onInteractOutside={(e) => e.preventDefault()}`, `onEscapeKeyDown` → close, `onOpenAutoFocus` foca
  "Próximo". Conteúdo (desenho final pela skill `frontend-design`): progresso "**3** de 13" no tom dos
  títulos de `Panel` com número `text-primary tabular-nums`; barra segmentada `aria-hidden`; `X` com
  `aria-label="Fechar tutorial"`; título `text-base font-extrabold uppercase`; texto
  `text-sm text-muted-foreground`; rodapé "Pular tutorial" (ghost), "Voltar" (outline), "Próximo"/"Concluir"
  (default). Passo 1: "Agora não" + "Começar". `ArrowRight`/`ArrowLeft` no conteúdo.

**Testes** (RTL + `user-event`, skill `react-testing-library`; mock de `next/navigation` com `usePathname`
e `push` controláveis; mock de `@/app/(app)/actions`; "palco" com `<div data-tour="...">`)
1. `autoStart` → `getByRole("dialog", { name: "Bem-vindo ao VLR Fantasy" })`.
2. "Começar" → "Seu saldo", "2 de 13", foco em "Próximo".
3. "Voltar" retorna ao convite.
4. Do passo 6, "Próximo" chama `push("/my-team")` e mostra "Carregando…"; ao trocar `usePathname` e
   inserir o alvo, aparece "Sua escalação".
5. `Esc` fecha e chama `completeTour` uma vez.
6. "Agora não" fecha e chama `completeTour`.
7. Alvo que nunca aparece (fake timers 8s): passo mostra título e texto, sem travar.
8. Passo 5 sem `fechamento-mercado` e com `proximos-jogos`: usa o reserva (polígono presente).
9. `autoStart={false}` → sem diálogo; `start()` abre.
10. `useTour()` fora do provider lança.

`wait-for-target.test.ts`: imediato; nó inserido depois; `null` no timeout; aborto cancela.

**Verificar:** `pnpm test components/tour lib/tour`, `lint`, `tsc`.

## Fase 3 — Os alvos nas telas

Só atributos e uma prop, nenhuma lógica.
- **muda** `components/layout/panel.tsx`: prop `tourId?: TourTarget` espalhada na `<section>`.
- **muda** `app-header.tsx:70` (`saldo`), `region-switcher.tsx:29` (`regiao`), `account-menu.tsx:53` (`conta`).
- **muda** `components/home/upcoming-matches.tsx:50,65` (`proximos-jogos`); `match-schedule.tsx:194` —
  `MarketCell` ganha `tourAnchor?: boolean` (= `isNext`) e aplica `fechamento-mercado` só então;
  `team-performance.tsx:63` (`desempenho`).
- **muda** `components/team/roster-panel.tsx:207` (`escalacao`) e `:243` (`capitao`); `budget-bar.tsx:47`
  (`orcamento`); `team-stats.tsx:40` — `Stat` local ganha `tourId` (`relogio-mercado`).
- **muda** `app/(app)/ranking/page.tsx:128` e `components/championship/empty-championships.tsx:17`
  (`campeonatos`); `app/(app)/profile/page.tsx:97` (`perfil`).

**Testes** (nos arquivos existentes): em `upcoming-matches.test.tsx`, só o `MarketCell` da próxima partida
tem `data-tour="fechamento-mercado"` e, sem jogos, o painel tem `proximos-jogos`; uma asserção
`container.querySelector('[data-tour="…"]')` em `budget-bar`, `team-stats`, `roster-panel`,
`empty-championships`, `region-switcher`. Suíte inteira continua verde.

**Verificar:** `pnpm test components`, `tsc`.

## Fase 4 — Gatilho no menu da conta e montagem no layout

**Arquivos:** `components/layout/account-menu.tsx:81-95` (+ teste), `components/layout/app-header.test.tsx`
(envolver em `TourProvider autoStart={false}` e acrescentar `usePathname` ao mock), `app/(app)/layout.tsx:60-74`.

```tsx
// account-menu.tsx — entre o rótulo e o "Sair"
const { start } = useTour();
const startingTour = useRef(false);
<DropdownMenuContent
  align="end"
  className="min-w-56"
  // O Radix devolve o foco ao gatilho ao fechar; com o tour abrindo, isso brigaria com o foco do cartão.
  onCloseAutoFocus={(event) => {
    if (startingTour.current) { event.preventDefault(); startingTour.current = false; }
  }}
>
  {/* rótulo */}
  <DropdownMenuSeparator />
  <DropdownMenuItem className="cursor-pointer" onSelect={() => { startingTour.current = true; start(); }}>
    <CircleQuestionMark aria-hidden />
    Ver tutorial
  </DropdownMenuItem>
  <DropdownMenuSeparator />
  {/* "Sair" como está */}
</DropdownMenuContent>
```

```tsx
// app/(app)/layout.tsx — dentro do RegionDisplayProvider
<TourProvider autoStart={overview.tourCompletedAt === null}>
  <AppHeader ... />
  {children}
</TourProvider>
```

**Testes:** `account-menu.test.tsx` — "Ver tutorial" aparece **antes** de "Sair"; clicar abre o diálogo
"Bem-vindo ao VLR Fantasy"; testes de "Sair" seguem sem mudança. `app-header.test.tsx` verde com o wrapper.

## Verificação end-to-end

- `pnpm test` (suíte inteira), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- Manual em `pnpm dev`, com migration aplicada no banco certo:
  1. **Primeiro acesso:** zerar `tour_completed_at` do próprio usuário no `pnpm db:studio` e abrir `/home`.
     O convite aparece uma vez, sem reabrir quando o `TimezoneSync` fizer refresh.
  2. **Roteiro inteiro:** "Começar" → Próximo até o fim; o tour troca para `/my-team`, `/ranking`,
     `/profile` sozinho; "3 de 13" avança; Voltar a partir do passo 7 volta para `/home`.
  3. **Passo 5 aponta o "Mercado fecha HH:mm" do próximo jogo**, no fuso do usuário (plano 24).
  4. **Teclado:** `Tab` não sai do cartão; `→`/`←` andam; `Esc` fecha; recarregar não reabre; coluna preenchida.
  5. **Menu:** "Ver tutorial" a partir de `/ranking` abre o convite ali; "Começar" leva a `/home`.
  6. **Estados vazios:** sem campeonato (passo 11 destaca o vazio) e Home sem jogos (passo 5 cai no painel).
  7. **Mobile 390×844:** passos 2/3/13 acham os alvos; painéis altos usam cartão no rodapé; nada sai da tela.
  8. **Leitor de tela:** troca de passo anunciada.
  9. Console sem aviso de hidratação nem erro de `act`.

## Riscos e o que fica de fora

**Riscos**
1. **Página lenta** (>8s, Supabase frio): o passo abre sem recorte. Ajuste é só `timeoutMs`.
2. **Alvo muda de lugar** no meio do passo (`LiveRefresh`): o loop acompanha; o cartão pode "andar". Aceito.
3. **Time vazio no primeiro acesso:** o passo "Capitão" aponta um campo sem jogador; o texto continua verdadeiro.
4. **Migration no banco errado:** aditiva e reversível, mas é o risco real — conferência manual (fato 13).
5. **`modal` bloqueia a página:** toast do Sonner aparece mas não é clicável durante o tour.
6. **Texto envelhece** se a regra mudar de forma (não só de número); os testes cobrem só as constantes.

**Fora do escopo**
- Não abre o `MarketSheet` nem executa `loadMarket` durante o tour.
- Não cria navegação mobile (hambúrguer).
- Não há tour por tela nem tooltips permanentes; um tour só, linear.
- Sem tradução, sem analytics de conclusão/abandono, sem backfill, sem Playwright.
- Não corrige a frase do `CLAUDE.md` ("pontuação aumenta ou diminui o saldo"), que discorda do código
  (fato 8) — fica nomeada para o Rodrigo decidir.

## Após aprovação

Copiar este plano para `.claude/plans/25-tour-guiado-primeiro-acesso.md` e **parar** — implementação só
quando o Rodrigo liberar.
