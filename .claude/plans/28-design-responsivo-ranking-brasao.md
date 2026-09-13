# 28 — Design: responsividade, Time Montado, Ranking e brasão

> Destino no repositório: `.claude/plans/28-design-responsivo-ranking-brasao.md`.
> Fonte do pedido: `prompts/28_design_changes.md`.
> Skills obrigatórias na implementação: `frontend-design`, `shadcn`, `next-best-practices`,
> `vercel-react-best-practices`, `web-design-guidelines` (+ `react-testing-library` nos testes).

## Context

O app funciona, mas o visual não acompanha o resto do produto em quatro pontos:

1. **"Time Montado" ocupa quase uma tela inteira** em `/my-team` (≈650px no desktop) e esconde que
   existe conteúdo abaixo (TeamStats, maior/menor pontuador).
2. **Não é responsivo de verdade**: não existe navegação mobile — o header só quebra em linhas e
   estoura em 375px; várias linhas e grids não têm breakpoint.
3. **Ranking é uma tabela crua** e os campeonatos ficam escondidos num `Select`.
4. **Brasão tem pouca variação e símbolos infantis** (caveira, fantasma, estrela, coroa do lucide).

**Resultado esperado:** um app que funciona bem de 360px a desktop largo, com navegação inferior
no celular; Time Montado da mesma altura que o "Resumo"; Ranking com pódio, lista em cards e
campeonatos em cards; e um editor de brasão com mais formatos, cores e símbolos originais
inspirados em Valorant — tudo dentro da identidade dark/vermelho `#FF4655`/cantos chanfrados,
adulto e profissional.

## Fatos apurados (13/09/2026)

1. **Time Montado** — `components/team/roster-panel.tsx:206-252` põe "Resumo" e "Time Montado" num
   `grid lg:grid-cols-[420px_1fr] items-start`. A altura vem de `pt-[78%]` no tabuleiro
   (`components/team/formation-board.tsx:181`), com 5 marcadores absolutos em losango (`:16-22`),
   foto fixa de 56px (`:56`) e `overflow-hidden`. Desktop ≈587px de tabuleiro contra ≈370px do Resumo;
   em 375px os marcadores de baixo são **cortados**. O esqueleto copia a proporção
   (`app/(app)/my-team/loading.tsx:54`).
2. **Header** — `components/layout/app-header.tsx:55-114`: grupo esquerdo sem wrap (logo, brasão +
   nome sem `truncate`, saldo, região), nav de 4 links com rótulo sempre visível, sem menu mobile.
   Não é sticky. Contém 3 alvos do tour: `saldo` (:71), `regiao` (`region-switcher.tsx:31`),
   `conta` (`account-menu.tsx:61`).
3. **Contêiner** — toda página repete `mx-auto max-w-7xl px-6 py-9` (home, my-team, ranking, profile
   e seus `loading.tsx`); não há padding menor no mobile.
4. **Outros pontos de mobile**: `player-row.tsx:227-279` (nome esmagado por foto + chip + botão
   "Vender" com texto), `budget-bar.tsx:54` (`grid-cols-3` sem breakpoint),
   `market-summary-bar.tsx:76-78`, `market-sheet.tsx:344-390` (busca + 3 filtros numa linha sem
   wrap), `team-performance.tsx:66-116` (chips empilham acima do gráfico), texto de 9–11px espalhado.
5. **Ranking** — só existe classificação de campeonatos privados, por região, em `/ranking?c=<id>`
   (`app/(app)/ranking/page.tsx`). `StandingsTable` (`components/championship/standings-table.tsx`)
   é um `Table` shadcn com #, Time, Login, Pts; zonas vêm de `standingZone`/`PODIUM_SIZE`
   (`lib/championship/standings.ts:38-48`). Dado por membro: `userId, userName, username, teamName,
   crest, points, position, isCurrentUser`. `ChampionshipSelector` é um `Select`
   (`components/championship/championship-selector.tsx`). A posição do usuário em vários campeonatos
   já é calculável com `getStandingRowsByChampionship(ids)` + `rankStandings`
   (`lib/championship/queries.ts:101`, usado pela Home).
6. **Brasão** — catálogo só em TypeScript (`lib/crest/catalog.ts`: 5 formatos, 12 símbolos lucide,
   8 cores `--crest-*` em `app/globals.css:104-114`). Colunas `text` sem CHECK
   (`db/schema/fantasy-identity.ts:27-31`) → **adicionar/remover valores não exige migração**.
   `parseCrest` (`lib/crest/crest.ts:37-55`) cai no padrão por campo quando o valor é desconhecido.
   Zod em `lib/validations/profile.ts:11-18` usa `z.enum(CREST_*)`. Render em
   `components/crest/team-crest.tsx` (paths SVG 64×64 + ícone lucide absoluto). Editor em
   `components/profile/crest-editor.tsx` (RHF + Zod + next-safe-action; formatos só como texto).
   Mudar `DEFAULT_CREST` geraria migração de default — **não mudar**.
7. **Tour** — alvos `escalacao`/`capitao` estão nos Panels do roster; `campeonatos` no Panel da
   classificação e em `EmptyChampionships`; `perfil` no Panel "Identidade do time". Esqueletos
   **não podem** ter `data-tour`.
8. **Branch** — plano 27 já está na `main` (`cdc39f3`). A branch do 28 nasce da `main`.

## Decisões confirmadas com o Rodrigo (13/09/2026)

| # | Pergunta | Decisão |
| --- | --- | --- |
| D1 | Símbolos do brasão | **SVGs originais** desenhados à mão, inspirados no jogo, sem arte da Riot. |
| D2 | Navegação no celular | **Barra inferior fixa** + header compacto. |
| D3 | Classificação do campeonato | **Pódio (top 3) + lista em cards**. |
| D4 | Lista de campeonatos | **Cards em faixa rolável**, "Criar campeonato" como último card. |

## Fase 0 — Branch

`git checkout main && git pull && git checkout -b feat/design-responsivo-ranking-brasao`.

## Fase 1 — Fundação responsiva (shell do app)

**Arquivos**
- **novo** `components/layout/page-container.tsx` — `mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-9`
  + `pb-[calc(theme(spacing.24)+env(safe-area-inset-bottom))] md:pb-9` (espaço da barra inferior).
  Substitui a string repetida em `home`, `my-team`, `ranking`, `profile` e nos 4 `loading.tsx`.
- **novo** `components/layout/bottom-nav.tsx` (client) — `md:hidden fixed inset-x-0 bottom-0`,
  4 itens (Início, Escalação, Ranking, Perfil) ícone + rótulo 11px, alvo de toque ≥ 44px,
  `aria-current="page"`, faixa vermelha no item ativo, `bg-sidebar/95 backdrop-blur`, borda superior,
  `pb-[env(safe-area-inset-bottom)]`. Extrair `SECTIONS` do header para
  `components/layout/sections.ts` e reutilizar nos dois (sem duplicar).
- `components/layout/app-header.tsx` —
  - `< md`: linha única: logo curto ("VLR" + brasão `sm`), saldo, `RegionSwitcher`, `AccountMenu`.
    Nome do time some (`hidden md:inline`, com `truncate max-w-[16ch]` no desktop). Nav some
    (`hidden md:flex`).
  - `≥ md`: layout atual, com `min-w-0`/`truncate` onde faltava.
  - Header vira `sticky top-0 z-40` com `backdrop-blur` (ajuda o tour: `saldo`/`regiao`/`conta`
    ficam sempre visíveis). **Os 3 `data-tour` continuam no header em todos os tamanhos.**
- `app/(app)/layout.tsx` — renderiza `<BottomNav />` depois de `children`.
- `app/layout.tsx` — `export const viewport = { viewportFit: "cover", themeColor: … }` (conferir a
  API em `node_modules/next/dist/docs/` antes).

**Testes (RTL)**: `bottom-nav.test.tsx` (4 links por role, `aria-current` no ativo),
`app-header.test.tsx` atualizado (alvos do tour presentes; nav desktop continua acessível).

## Fase 2 — Time Montado compacto

**Objetivo:** no desktop, o tabuleiro tem a **mesma altura do Resumo**; no mobile, nada é cortado.

- `components/team/roster-panel.tsx` — grid vira
  `lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-stretch`; o Panel "Time Montado" recebe
  `h-full` e o conteúdo `flex-1`.
- `components/team/formation-board.tsx` —
  - **≥ sm**: troca `pt-[78%]` por altura controlada: `h-[300px] lg:h-full lg:min-h-[320px]`
    (acompanha o Resumo). Reposicionar `POSITIONS` para uma formação mais achatada (topos entre
    8% e 58%) e laterais com margem (8%–92%) para não encostar na borda. Foto 48px no lg, 56px no xl.
  - **< sm**: sem posicionamento absoluto — `grid grid-cols-3 gap-y-4` (3 + 2 centralizados), foto
    44px, nick com `truncate`. Mesmo `Marker`, só muda o invólucro: extrair o layout em duas
    variantes com `className` responsivo (`sm:absolute` + `style` só aplicado no `sm+` via CSS var
    `--top/--left`), evitando render duplicado.
  - Adicionar um detalhe visual discreto de "mapa" (linhas diagonais / grid tático com
    `bg-[linear-gradient]` sobre `--border`) para o espaço não parecer vazio.
- `components/team/team-stats.tsx` / `my-team/page.tsx` — sem mudança de ordem; com o tabuleiro
  menor, TeamStats aparece na primeira dobra do desktop.
- `app/(app)/my-team/loading.tsx` — acompanhar as novas alturas.
- `tourId="capitao"` continua no Panel.

**Testes**: `formation-board.test.tsx` — 5 vagas renderizam (botões por label), capitão e alerta
continuam acessíveis; nenhum teste de pixel.

## Fase 3 — Varredura de responsividade nas telas

Padrão aplicado em todas: `min-w-0` em filhos flex com texto, `truncate`/`line-clamp`, `flex-wrap`
onde há ações, grids com breakpoint, alvos de toque ≥ 44px, piso de texto 11px para informação
(10px só em rótulos uppercase decorativos). Lista representativa:

- `components/team/player-row.tsx` — `< sm`: botão "Vender" vira ícone com `aria-label`
  ("Vender {nick}"), chip de pontos abaixo do nome; nome com `truncate`.
- `components/team/budget-bar.tsx` — `grid-cols-3` só a partir de `sm`; no mobile, os três valores
  viram linhas `justify-between`.
- `components/market/market-summary-bar.tsx`, `market-sheet.tsx` — filtros quebram para a linha de
  baixo (`flex-wrap`, busca `basis-full sm:basis-auto`); sheet `w-full sm:max-w-lg` mantido.
- `components/home/team-performance.tsx` — chips de jogador em `ScrollArea` horizontal no mobile.
- `components/home/match-schedule.tsx`, `match-row.tsx`, `round-highlights.tsx`,
  `components/profile/*`, `components/championship/pending-invites.tsx` — conferir e ajustar.
- `components/auth/auth-shell.tsx` e `app/page.tsx` (landing) — conferir em 360px.

**Checklist de viewport** (DevTools): 360×740, 390×844, 768×1024, 1024×768, 1280×800, 1920×1080 —
sem scroll horizontal no `body`, nada cortado, toque confortável.

## Fase 4 — Ranking e campeonatos (D3, D4)

**Dados** (sem migração):
- `lib/championship/queries.ts` — nova `listUserChampionshipsWithPosition(userId, region)`: reusa
  `listUserChampionships` + `getStandingRowsByChampionship(ids)` + `rankStandings` para devolver
  `ChampionshipCardData = ChampionshipSummary & { myPosition: number | null }`. Tipo em
  `lib/championship/types.ts`. Uma ida ao banco por lote, não por campeonato.

**Componentes** (`components/championship/`):
- **novo** `championship-rail.tsx` — faixa `flex gap-3 overflow-x-auto snap-x` (com
  `scroll-px-4`, fade nas bordas). Cada card é um `Link` para `?c=<id>` (`clip-corner [--clip:12px]`,
  ~220px): nome (truncate), ponto de região (`regionColor`), "N membros", "Você: 2º" em destaque.
  Selecionado: `ring-primary` + faixa vermelha. Último card: `CreateChampionshipDialog` com trigger em
  formato de card tracejado. Substitui `ChampionshipSelector` em `ranking/page.tsx` (apagar o
  componente e seu teste se ficar sem uso).
- **novo** `standings-podium.tsx` — top 3 (respeitando empates de `rankStandings`):
  - `≥ sm`: três colunas 2º | 1º | 3º, bases de alturas diferentes em `clip-corner`, brasão no
    novo tamanho `podium` (72px; 1º) e `md` (44px; 2º/3º), posição grande, time, `@login`, pontos
    em `text-info`. 1º com borda/brilho `primary`.
  - `< sm`: pódio vira 3 linhas-destaque empilhadas (1º maior).
  - Com < 3 membros: mostra só quem existe.
- **reescrever** `standings-table.tsx` → `standings-list.tsx` — do 4º em diante, linhas em card
  (`<ol>` semântico, cada `<li>` com posição em badge chanfrado, brasão `sm`, time + `@login` em 2
  linhas no mobile, pontos à direita). Mantém `standingZone` (líder/zona) com faixa lateral e texto
  `sr-only`. Linha do usuário: `ring-primary/40` + "Você". Se o usuário estiver fora da tela (lista
  longa), um cartão "Sua posição" fixo no fim do Panel.
- `app/(app)/ranking/page.tsx` — ordem: convites → `RegionTabs` → `ChampionshipRail` → Panel
  "Classificação" (`tourId="campeonatos"`, pódio + lista) → Panel "Convidados" (owner). Nota da
  pontuação mantida.
- `empty-championships.tsx` — revisar visual (ilustração com símbolo de troféu em SVG próprio,
  CTA primário); mantém `tourTarget("campeonatos")`.
- `app/(app)/ranking/loading.tsx` — faixa de cards + pódio + linhas em `Skeleton`, sem `data-tour`.
- `components/profile/championship-placements.tsx` — alinhar ao novo card (badge de posição igual ao
  da lista) para consistência entre Perfil, Home (`round-recap.tsx`) e Ranking.

**Testes (RTL)**: `championship-rail.test.tsx` (links, selecionado com `aria-current`, "Você: Nº",
card de criar abre o dialog), `standings-podium.test.tsx` (ordem 1º/2º/3º, empate, < 3 membros),
`standings-list.test.tsx` (começa no 4º, zona `sr-only`, "Você"), `ranking/loading.test.tsx`
(sem `data-tour`), query nova com `db` mockado.

## Fase 5 — Brasão: formatos, cores e símbolos (D1)

**Catálogo** — `lib/crest/catalog.ts` (os `Record<…>` tipados obrigam label/var/ícone para cada
chave nova):
- **Formatos** (5 → 11): mantém `shield, diamond, circle, chevron, hex`; adiciona `chamfer`
  (quadrado de cantos chanfrados, a assinatura do app), `octagon`, `kite` (escudo pipa),
  `delta` (triângulo invertido), `banner` (flâmula com recorte em V), `heater` (escudo clássico com
  ombros). Paths 64×64 em `SHAPE_PATHS` (`components/crest/team-crest.tsx`).
- **Cores** (8 → 16): adiciona em `app/globals.css` e `CREST_COLOR_VARS`/`LABELS`:
  `crimson` (Carmesim), `orange` (Laranja), `gold` (Dourado), `teal` (Verde-azulado), `navy`
  (Marinho), `purple` (Roxo), `magenta` (Magenta), `black` (Obsidiana). Hex definidos na
  implementação com a skill `frontend-design`, conferindo contraste fg/bg.
- **Símbolos** (12 → 16), todos SVG originais, traço geométrico sólido:
  `crosshair` (mira — mantém o id do padrão), `headshot` (mira com ponto), `spike`, `knife`,
  `radianite` (cristal), `ult-orb`, `smoke`, `flash`, `molly` (chama geométrica), `barrier`,
  `recon` (dardo/radar), `duelist`, `initiator`, `controller`, `sentinel`, `ace` (chevron "A").
  **Sem arte, logo ou ícone oficial da Riot.**

**Render**
- **novo** `components/crest/crest-symbols.tsx` — `CREST_SYMBOL_PATHS: Record<CrestSymbol, ReactNode>`
  (viewBox 24, `fill="currentColor"`). `TeamCrest` passa a desenhar o símbolo **dentro do mesmo
  `<svg>`** (`<svg x y width height viewBox="0 0 24 24">`) em vez do ícone lucide absoluto — mais
  nítido e sem desalinhamento. `CREST_SYMBOL_ICONS` (lucide) sai do catálogo.
- `SIZE_PX` ganha `podium: 72` (Fase 4).

**Compatibilidade** (sem migração): `lib/crest/crest.ts` ganha `LEGACY_SYMBOLS` aplicado antes da
validação em `parseCrest`: `skull→spike`, `ghost→smoke`, `star→radianite`, `crown→ace`,
`swords→knife`, `eye→recon`, `shield-check→barrier`, `bolt→flash`, `zap-off→flash`,
`flame→molly`, `target→headshot`. Quem já salvou mantém um brasão parecido. `DEFAULT_CREST` não muda.

**Editor** — `components/profile/crest-editor.tsx`:
- Formatos: grade de miniaturas SVG do formato (não mais só texto), `grid-cols-4 sm:grid-cols-6`.
- Símbolos: grade de miniaturas `grid-cols-4 sm:grid-cols-8`, rótulo no `title`/`sr-only`.
- Cores: swatches chanfrados em grade `grid-cols-8`, nome no `sr-only` + tooltip visual; mantém
  `role="radiogroup"` e os inputs radio `sr-only` do `OptionGroup` (acessibilidade atual).
- Prévia `lg` ao lado das opções no desktop (`lg:sticky`) e no topo no mobile, sempre visível
  enquanto o usuário escolhe.

**Testes**: `crest.test.ts` (aliases legados → novo símbolo; valores novos válidos),
`team-crest.test.tsx` (todo formato e símbolo do catálogo renderiza com `aria-label`),
`crest-editor.test.tsx` (selecionar formato/símbolo/cor novo envia o valor; radiogroups por role),
`actions.test.ts` do perfil segue verde com o `crestSchema` ampliado.

## Verificação

- `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- `pnpm dev`, DevTools nos 6 viewports da Fase 3:
  1. `/my-team`: Time Montado com a altura do Resumo no desktop; TeamStats visível sem rolar muito;
     em 360px os 5 jogadores aparecem inteiros, capitão e "+" clicáveis.
  2. Barra inferior só `< md`, item ativo correto, conteúdo não fica escondido atrás dela; header
     numa linha só em 360px; sem scroll horizontal em nenhuma tela.
  3. `/ranking`: faixa de campeonatos rola com o dedo, card selecionado destacado, "Você: Nº"
     correto; pódio com empate; campeonato com 1–2 membros; estado vazio.
  4. `/profile`: novos formatos/cores/símbolos salvam e aparecem no header, no ranking e na lista de
     amigos; usuário com símbolo legado (`skull` no `pnpm db:studio`) vê `spike`.
  5. Tour completo (zerar `tour_completed_at`) em 390×844 e desktop: `saldo`, `regiao`, `conta`,
     `capitao`, `campeonatos` e `perfil` destacam a seção certa.
  6. Skill `web-design-guidelines` sobre os arquivos alterados (foco, contraste, toque, `aria`).

## Riscos e o que fica de fora

**Riscos**
1. **Escopo grande** — 5 fases independentes; dá para entregar em PRs separados (1+2+3, 4, 5).
2. **Desenho dos 16 símbolos** é o maior trabalho manual; qualidade visual pede iteração com o
   Rodrigo (sugestão: prancha com todos antes de fechar a Fase 5).
3. **Header sticky + barra inferior** reduzem a área útil no mobile; o header compacto compensa.
4. Aliases legados trocam o símbolo de quem já tinha brasão — parecido, não idêntico.
5. Remover `ChampionshipSelector`/`StandingsTable` quebra testes existentes; reescrevê-los faz parte.

**Fora de escopo**
- Ranking global/entre todos os usuários e variação de posição no `/ranking`.
- Light mode, novas fontes, animações elaboradas.
- Upload de imagem como brasão; ícones oficiais da Riot.
- Mudanças de regra de pontuação, mercado ou banco.
