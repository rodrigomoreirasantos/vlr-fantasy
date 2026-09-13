# 27 — Tour guiado: sincronia com a tela, scroll até o alvo e textos

> Destino no repositório: `.claude/plans/27-tour-passo-a-passo.md`.
> Fonte do pedido: `prompts/27_fix_step_by_step.md`. Corrige a implementação do plano
> `.claude/plans/25-tour-guiado-primeiro-acesso.md`.

## Context

O tour guiado funciona, mas três coisas atrapalham quem está vendo pela primeira vez:

1. **O passo a passo fala da próxima tela enquanto a tela anterior ainda está lá.** Ao trocar de aba,
   o cartão já mostra título, texto e "N de 13" do passo novo antes de a página nova existir.
2. **A tela não rola até a seção destacada.** Em quatro passos o recorte aponta para fora da
   viewport: o usuário vê só a tela escurecida, sem entender o que estava sendo explicado.
3. **Um texto mentia**: o passo do orçamento dizia que os mais caros nunca cabem juntos. Isso já foi
   corrigido pelo plano 26 — o que sobra é uma revisão dos demais textos.

**Resultado esperado:** o cartão só troca de conteúdo quando a tela nova já está pronta; todo passo
rola a página até o alvo antes de destacá-lo; e nenhum texto promete uma regra que o jogo não tem.

### ⚠️ Achado urgente, anterior ao tour: a produção está quebrada

A produção roda a branch `main`. As migrações do plano 26 (`0021`/`0022`) **já foram aplicadas no
banco de produção** em 12/09, removendo `round_team_result.budget_trimmed_cents`. Mas o código em
`main` ainda pede essa coluna (`lib/round/queries.ts:142` na `main`), e o banco tem **7 rodadas
`finished`** — então `getLatestFinishedRound()` devolve rodada, a consulta roda e estoura. Os dois
chamadores são `/home` (`lib/home/queries.ts:84,98`) e `/my-team` (`lib/team/queries.ts:166`).

Enquanto a `main` não for atualizada, essas duas telas erram em produção. Por isso a Fase 0 vem
antes de qualquer linha de código do tour.

## Fatos apurados (13/09/2026)

1. **Não existe uma única linha de scroll no tour.** Varredura por
   `scrollIntoView|scrollTo|scrollY|scrollTop` em `lib/tour/**` e `components/tour/**`: nenhum hit (o
   único no repo é o stub de jsdom em `vitest.setup.ts:41-42`). O plano 25 previa
   `scrollIntoView({ block: "center" })` (`.claude/plans/25-tour-guiado-primeiro-acesso.md:255`) e a
   implementação não o incluiu.
2. **Alvo fora da dobra vira recorte de altura zero.** `spotlightRect` clampa o retângulo à viewport
   (`lib/tour/geometry.ts:19-33`): alvo em `top: 1500` com viewport de 800 dá `height: 0` → máscara
   sem furo, contorno invisível. `cardPlacement` (`:60-75`) cai em `top`/`docked` e o
   `collisionPadding={16}` do Radix traz o cartão de volta à tela — apontando para nada.
3. **A dessincronia tem uma linha exata.** `components/tour/tour-provider.tsx:104-107`:

   ```tsx
   if (step.route && step.route !== pathname) {
     router.push(step.route);
     return;              // sai sem setResolving(true) e sem limpar resolvedTarget
   }
   ```

   O cartão (`:190-204`) deriva de `step`, que já é o passo novo; `loading` continua `false` e o
   recorte continua no alvo do passo **anterior**. O efeito só reexecuta quando `usePathname()` muda
   (dependência, `:148`). No teste isso não aparece porque o `push` mockado atualiza o pathname de
   forma síncrona (`components/tour/tour-provider.test.tsx:31-34`).
4. **Nenhuma rota tem `loading.tsx`** (`find app -name loading.tsx` vazio). Sem ele, rota dinâmica
   não é pré-carregada nem parcialmente e a navegação espera o servidor renderizar a página inteira
   — exatamente o sintoma relatado
   (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:169-173`).
   `router.prefetch(href)` existe e está disponível (`.../04-functions/use-router.md:47`).
5. **Os quatro alvos que o Rodrigo apontou, conferidos no JSX:**
   - `desempenho` — 2º painel da Home, depois do calendário inteiro (`app/(app)/home/page.tsx:83`).
   - `relogio-mercado` — último bloco de `/my-team`, depois de `BudgetBar` + `RosterPanel`
     (`app/(app)/my-team/page.tsx:84`; alvo em `components/team/team-stats.tsx:46`).
   - `campeonatos` — `app/(app)/ranking/page.tsx:128`; o topo fica perto da dobra, mas o painel é
     alto e cai em `docked`.
   - `perfil` — `app/(app)/profile/page.tsx:98-101`: o alvo é **o grid inteiro da página**, mais alto
     que a viewport; destaca "tudo", que é o mesmo que não destacar nada.
6. **O header não é sticky** (`components/layout/app-header.tsx:55`). Os alvos que vivem nele —
   `saldo` (`app-header.tsx:71`), `regiao` (`region-switcher.tsx:31`), `conta` (`account-menu.tsx:61`)
   — saem da tela se a página ficou rolada no passo anterior. Rolar resolve os dois sentidos.
7. **`waitForTarget` espera 8s** (`lib/tour/wait-for-target.ts:13`), com `MutationObserver` e sem
   polling; primário + reserva pode chegar a 16s. Estourar não trava nem pula: o passo abre
   centralizado (`tour-provider.tsx:141-144`).
8. **Os textos já estão em dia.** `lib/tour/steps.ts:90-96` na base nova: título "Patrimônio", corpo
   "Jogo ruim desvaloriza (até 10% por rodada)… escalar os 5 mais caros", com o "10%" interpolado de
   `MAX_SWING_RATIO`. Nenhum passo menciona teto de patrimônio.
9. **Estado das branches:** `feat/substituicao-jogadores-mercado` (default hoje) = `main` + 6 commits
   (os três PRs mergeados); `main` não tem **nenhum** commit exclusivo → dá para fast-forward, sem
   conflito possível.
10. **Ferramental:** `components/ui/skeleton.tsx` não existe (precisa do `shadcn add skeleton`). O
    stub de `scrollIntoView` do jsdom é no-op, então dá para espioná-lo com `vi.spyOn`.

## Decisões confirmadas com o Rodrigo (13/09/2026)

| # | Pergunta | Decisão |
| --- | --- | --- |
| D1 | O que aparece enquanto a próxima tela carrega? | **Segurar o passo atual** — o cartão só troca (texto, contador e recorte, juntos) quando a tela nova está pronta. |
| D2 | Incluir `loading.tsx`? | **Sim, nas 4 telas.** |
| D3 | Passo "Seu perfil" | **Estreitar** o alvo para o painel "Identidade do time". |
| D4 | Branch | **`main` atualizada e virando default**; a branch do plano 27 nasce dela. |

## Fase 0 — Colocar a `main` em dia e torná-la default

Pré-requisito de tudo, e conserta a produção (ver o achado acima). Nenhuma alteração de código.

1. **Fast-forward da `main`** (sem merge commit, sem conflito — fato 9):
   ```bash
   git checkout main
   git fetch origin
   git merge --ff-only origin/feat/substituicao-jogadores-mercado
   git push origin main
   ```
2. **Trocar a branch default no GitHub** para `main` (Settings → Branches). Feito pelo Rodrigo na
   interface: o token do MCP do GitHub não tem permissão de escrita (deu `403` ao tentar abrir o PR
   do plano 26).
3. **Conferir na Vercel** que a Production Branch é `main` e acompanhar o deploy disparado pelo push.
4. **Verificar em produção** que `/home` e `/my-team` carregam — é a prova de que o código voltou a
   bater com o banco já migrado.
5. **Limpar as branches mergeadas**: `feat/horario-jogos-fuso-usuario`, `feat/tour-guiado`,
   `feat/regras-preco-e-saldo` e, depois que a default virar `main`,
   `feat/substituicao-jogadores-mercado`.
6. **Criar a branch do plano 27 a partir da `main` já atualizada**: `feat/tour-passo-a-passo`.

## Fase 1 — Esqueletos de carregamento (D2)

Faz a troca de aba ser imediata e permite o pré-carregamento parcial da rota (fato 4). Vale para o
app inteiro, não só para o tour.

**Arquivos**
- **nasce** `components/ui/skeleton.tsx` (`pnpm dlx shadcn@latest add skeleton`).
- **novos** `app/(app)/home/loading.tsx`, `app/(app)/my-team/loading.tsx`,
  `app/(app)/ranking/loading.tsx`, `app/(app)/profile/loading.tsx`.

Cada esqueleto repete a **moldura real** da sua página (mesmo `max-w`, mesmos paddings e a mesma
ordem de blocos) com `Skeleton` no lugar do conteúdo. Nenhuma cor hard-coded (CLAUDE.md): só
`bg-muted`/`bg-secondary` e `clip-corner`, como nos painéis de verdade.

⚠️ **Nenhum esqueleto pode conter `data-tour`** — senão o tour ancoraria no esqueleto em vez de
esperar o conteúdo real.

**Testes** (RTL): cada `loading.tsx` renderiza e
`expect(container.querySelector("[data-tour]")).toBeNull()`.

## Fase 2 — Rolar a tela até o alvo

**Arquivos**
- `lib/tour/geometry.ts` + `lib/tour/geometry.test.ts` — nova função pura.
- `components/tour/tour-provider.tsx` — chamar o scroll ao resolver o alvo.

```ts
// lib/tour/geometry.ts
/** Acima disto o alvo não cabe centralizado: alinha pelo topo. */
export const TALL_TARGET_RATIO = 0.8;

/**
 * Como levar o alvo à tela: `"center"` no caso normal, `"start"` quando o
 * alvo é mais alto que `TALL_TARGET_RATIO` da viewport — centralizar um
 * bloco gigante mostra o meio dele e esconde o começo.
 */
export function scrollAlignment(
  target: Rect,
  viewport: { height: number },
): "center" | "start";
```

No provider, entre resolver o alvo e publicá-lo (hoje `tour-provider.tsx:123-127` e `:134-138`), o
elemento devolvido por `waitForTarget` é rolado para a viewport **antes** de virar estado:

```ts
function scrollTargetIntoView(element: Element) {
  const rect = element.getBoundingClientRect();
  element.scrollIntoView({
    block: scrollAlignment(rect, { height: window.innerHeight }),
    // Instantâneo de propósito: com scroll suave, o `virtualRef` do Popover e
    // o laço de `requestAnimationFrame` do recorte ficariam medindo posições
    // intermediárias, e o cartão "andaria" junto. Também dispensa tratar
    // `prefers-reduced-motion`.
    behavior: "auto",
  });
}
```

Reaproveita o que já existe: o laço de `requestAnimationFrame` de
`components/tour/use-tour-geometry.ts:77-86` re-mede sozinho depois do salto, então recorte e cartão
nascem já na posição final. Nada muda em `TourSpotlight`.

**Testes**
- `geometry.test.ts`: `scrollAlignment` devolve `"center"` para um bloco baixo e `"start"` para um
  mais alto que 80% da viewport; caso de borda exatamente no limite.
- `tour-provider.test.tsx`: `vi.spyOn(Element.prototype, "scrollIntoView")` — chamado uma vez por
  passo com alvo, com `block: "center"`; **não** chamado no passo do convite (sem alvo); chamado com
  `block: "start"` quando o alvo é mais alto que a viewport.

## Fase 3 — Segurar o passo até a tela chegar (D1)

O coração do pedido. O cartão passa a mostrar o **passo pronto**, não o passo que a máquina já
avançou.

**Arquivos:** `components/tour/tour-provider.tsx`, `components/tour/tour-card.tsx` (+ testes).

**Como fica**

1. Estado novo no provider: `readyIndex: number | null` — o índice cujo alvo já foi resolvido (ou
   desistido) **na rota certa**. `TourCard` e `TourSpotlight` renderizam `TOUR_STEPS[readyIndex]`, e
   o contador vira `readyIndex + 1`: texto, número e recorte trocam **juntos**, num só instante.
2. O efeito de resolução passa a:
   - passo sem alvo e sem troca de rota (o convite) → `setReadyIndex` na hora;
   - rota diferente → `startTransition(() => router.push(step.route))` e **não** publica nada;
   - rota certa → `waitForTarget` (primário → reserva) → `scrollTargetIntoView` (Fase 2) →
     `setResolvedTarget(...)` + `setReadyIndex(stepIndex)`.
3. `pending = stepIndex !== readyIndex` substitui o `loading` de hoje. O cartão **não** troca o corpo
   por "Carregando…": o passo atual continua inteiro, e o feedback vai para o botão "Próximo"
   (spinner + `aria-busy`, desabilitado enquanto pendente). "Pular" e "Voltar" continuam ativos.
4. **Nunca travar:** um watchdog reaproveitando os mesmos 8s de `waitForTarget` — se a rota não
   commitar nesse tempo, publica o passo novo assim mesmo (centralizado, sem recorte), como já faz
   hoje quando o alvo não aparece (Decisão 4 do plano 25).
5. **Pré-carregar a próxima rota:** quando `readyIndex` muda, `router.prefetch` da rota do passo
   seguinte, se for diferente da atual. Com a Fase 1, a troca seguinte chega quase pronta.

O bloco que encerra o tour em navegação alheia (`tour-provider.tsx:161-168`) **não muda**: ele
compara com `step.route` da máquina, que continua sendo o passo novo.

**Testes** (RTL; o mock de `next/navigation` passa a ter `push` que **não** atualiza o pathname
sozinho — é o que faltava para reproduzir o bug)
- Ao clicar "Próximo" num passo que troca de aba: o cartão **continua** no passo anterior, o
  contador não anda, "Próximo" fica `aria-busy`; só depois de atualizar o pathname e inserir o alvo
  é que o passo novo aparece.
- O recorte não muda de alvo durante a espera.
- Watchdog com fake timers: pathname que nunca muda → após 8s o passo novo aparece centralizado.
- Os testes atuais de "Começar", "Voltar", `Esc`, "Agora não", reserva e alvo ausente seguem verdes.

## Fase 4 — Alvo do perfil e revisão dos textos

**Alvo (D3):** mover `tourTarget("perfil")` do grid da página inteira
(`app/(app)/profile/page.tsx:98-101`) para o painel "Identidade do time" (`:103-111`), usando a prop
`tourId` que o `Panel` já aceita (`components/layout/panel.tsx:19-22`). O recorte passa a destacar
nome e brasão — que é do que o texto do passo fala.

**Textos** (`lib/tour/steps.ts`) — dois passos prometem coisas que a tela nem sempre tem:

| Passo | Hoje | Proposta |
| --- | --- | --- |
| 8 `capitao` | "Toque no C de um jogador: o capitão pontua 2×." | "Escolha um capitão na sua escalação: ele pontua 2× na rodada." — no primeiro acesso o elenco está vazio e **não existe "C" na tela** para tocar. |
| 2 `saldo` | "Créditos para contratar. Jogador que joga bem valoriza e rende mais na venda." | "Créditos para contratar. Quem joga bem valoriza; quem joga mal desvaloriza e derrete seu patrimônio." — o lado ruim da regra nova só aparece 7 passos depois. |

O resto dos 13 textos fica como está (o do orçamento já foi corrigido pelo plano 26 — fato 8). O
`2×` continua vindo de `CAPTAIN_MULTIPLIER`.

**Testes:** `lib/tour/steps.test.ts` continua travando 13 passos, título ≤ 28, corpo ≤ 120,
contiguidade de rotas e as constantes interpoladas (as duas frases novas cabem no limite). Em
`/profile`, asserção de que `data-tour="perfil"` está no painel de identidade, não no grid da página.

## Verificação

- `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- **Manual em `pnpm dev`**, com `tour_completed_at` zerado no `pnpm db:studio`:
  1. Com o DevTools em **Slow 4G**: percorrer os 13 passos. Ao clicar "Próximo" numa troca de aba, o
     cartão **não pode** mudar de texto nem de número antes de a tela nova aparecer; o "Próximo"
     mostra o estado ocupado.
  2. Os quatro passos relatados — "Seus pontos" (/home), "Quanto falta" (/my-team), "Campeonatos"
     (/ranking) e "Seu perfil" (/profile) — a tela rola e o recorte vermelho aparece em volta da
     seção certa.
  3. Voltar do passo "Quer rever?" para "Seu perfil" rola de volta; o header reaparece quando o alvo
     é `saldo`/`regiao`/`conta`.
  4. Teclado (`←`/`→`/`Esc`), leitor de tela e mobile 390×844 seguem como no plano 25.
  5. Estados vazios: Home sem jogos (passo 5 cai no reserva) e `/ranking` sem campeonato.
- **Produção**, depois da Fase 0: `/home` e `/my-team` carregam, e o tour roda no ambiente real.

## Riscos e o que fica de fora

**Riscos**
1. **A Fase 0 dispara um deploy de produção com três features de uma vez** (fuso, tour, preço/saldo).
   É também o que conserta as telas quebradas — mas exige acompanhar o deploy.
2. **`loading.tsx` muda a troca de abas para todo usuário**, não só durante o tour. É o objetivo, mas
   é mudança visível fora do escopo do tour.
3. **Salto instantâneo de scroll** pode surpreender quem esperava rolagem suave. Trocar para
   `behavior: "smooth"` é uma linha, ao custo do cartão "andar" durante a animação.
4. **Segurar o passo pode parecer "não aconteceu nada"** em rede muito ruim; o spinner no "Próximo" e
   o watchdog de 8s são a defesa.
5. O laço de `requestAnimationFrame` continua medindo a cada frame durante o tour — custo que já
   existe hoje, não tratado aqui.

**Fora de escopo**
- Trocar o motor do tour por uma biblioteca pronta.
- Header sticky (resolveria os alvos do header de outro jeito, mas muda o layout do app inteiro).
- Testes E2E/Playwright, analytics de conclusão e tradução.
- Mexer na janela de 8s do `waitForTarget` ou no encadeamento primário → reserva.
- Tour por tela ou passos condicionais por estado da conta.
