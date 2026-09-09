# Mercado sempre atualizado — do agendador ao modal

## Context

`prompts/11_maket_players.md` pede que o modal do mercado (aberto ao clicar numa vaga da
Escalação) esteja **sempre** com o scrap mais recente, que o horário de fechamento siga o
campeonato como na aba Início, e que o saldo nunca fique velho.

Vasculhando o código, o pedido esbarra em cinco fatos:

1. **O scrap não roda sozinho.** Não existe `vercel.json`, cron, nem route handler. Os oito
   `pnpm vlr:*` são `tsx` disparados à mão; `docs/SCRAPING.md:40` diz "cron **sugerido**".
   Sem agendador, "sempre atualizado" é promessa vazia — o banco é que está velho, não a UI.
2. **A página manda o catálogo inteiro no HTML.** `app/(app)/my-team/page.tsx:45` chama
   `getMarketByRole` em todo render e passa o resultado como prop até o `MarketSheet`. O modal
   nunca busca nada: ele exibe o snapshot do último render — que numa aba aberta há horas é
   exatamente o dado velho que o prompt quer eliminar.
3. **O countdown do modal é de outro campeonato.** `loadTeamOverview`
   (`lib/team/queries.ts:141`) chama `nextMarketClose(lockMatches)` **sem recorte de região**.
   Abrindo o mercado do time de Americas, o "Mercado: 7h 12m" pode ser o fechamento de Pacific.
   E é string congelada no servidor, enquanto a Home tem `<MarketCountdown>` tickando.
4. **`summary.market.closesAt` já existe e ninguém usa** — `lib/team/types.ts:106` o descreve
   como "para um futuro countdown ao vivo no cliente". É esta fatia.
5. **O que envelhece não é o preço.** `player.priceCents`/`score` só mudam no fechamento de
   rodada (`calculateRound` → `closeActiveRound`). Numa aba aberta, o que muda com o relógio é
   a **trava** (`lockedOrganizations`) — e hoje o usuário só descobre pelo toast de erro que a
   Server Action devolve.

## Decisões (confirmadas na entrevista)

| Pergunta          | Decisão                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Frescor           | **Reler ao abrir o modal + auto-refresh leve na `/my-team`**                                  |
| Agendador         | **Entra no escopo**, fora do serverless — disco de HTML bruto preservado                      |
| Fechamento        | **Recortado pela região do time + countdown que tica**, como a Home                           |
| Payload           | **Separar**: refresh periódico é leve; catálogo só é buscado ao abrir o modal                 |
| Abertura do Sheet | **Abre na hora**, a lista se preenche sozinha — nada de segurar a abertura                    |
| Hospedagem        | Ainda só local; entregar portátil, sem amarrar a provedor                                     |
| Saldo             | Precaução — conferir o caminho `revalidatePath`, sem bug conhecido                            |

### Uma divergência deliberada, registrada

A opção escolhida citava "GitHub Actions **ou** cron do sistema". **Runner do GitHub Actions é
efêmero**: `diskRawStore` (`lib/vlr/http/raw-store.ts:37`) grava `.html.gz` e `match.rawHtmlPath`
aponta para ele — num runner descartável, todo caminho gravado morre com o job e
`pnpm vlr:reprocess` (o pilar de "o HTML bruto é o dado") quebra em silêncio. Das duas, entrego
a que honra a decisão: **cron do sistema / Docker com volume nomeado**. Fica documentado no
plano para não parecer omissão.

---

## Parte 1 — O agendador (fora do serverless)

Nenhuma linha de `lib/vlr/` muda. O que falta é **onde** os scripts existentes rodam.

**Novos arquivos, todos em `deploy/vlr-cron/`:**

- `crontab` — as linhas exatas da tabela de `docs/SCRAPING.md:40-55`, cada uma envolvida em
  `flock -n` sobre um lockfile próprio. Duas execuções de `vlr:results` sobrepostas iriam à rede
  pela mesma página; `vlr_job_run` protege só o `scrapeMatch` (`FOR UPDATE SKIP LOCKED`), não os
  outros jobs. `flock` resolve sem uma linha de código.
- `Dockerfile` — Node 22 + pnpm + `tsx`, com o repo e `WORKDIR` fixo (o fallback de
  `raw-store.ts:56-63` existe justamente porque `rawHtmlPath` é relativo ao cwd).
- `docker-compose.yml` — o serviço de cron com **volume nomeado montado em `VLR_STORAGE_DIR`**.
  É o volume que faz `vlr:reprocess` continuar valendo entre execuções.
- `README.md` curto: `docker compose up -d`, as variáveis obrigatórias (`DATABASE_URL`,
  `VLR_CONTACT_EMAIL`) e a alternativa sem Docker (colar o `crontab` num `crontab -e` de VPS).

**Alteração em `docs/SCRAPING.md`:** a coluna "Cron **sugerido**" vira "Cron", apontando para
`deploy/vlr-cron/`, mais um parágrafo dizendo por que o agendador não pode ser serverless
(disco efêmero + `workQueue` com `limit: 10` × rate limit de 1,1s = ≥11s, acima do teto de 10s
de função Hobby).

Nada aqui é executado no build ou no runtime do Next — é infraestrutura ao lado.

---

## Parte 2 — Catálogo sob demanda, no clique

O coração do "SEMPRE atualizado ao clicar".

### Nova Server Action `loadMarket` (`app/(app)/my-team/actions.ts`)

Com `authActionClient` (`lib/safe-action.ts`), como as três já existentes. Input `{ slotId }`
validado por Zod novo em `lib/validations/market.ts` (ao lado de `substitutePlayerSchema`).

A região **nunca vem do cliente** — sai do banco, exatamente como `substitutePlayer` já faz:

1. `lockTeamForSlot(db, ctx.userId, slotId)` → o time dono da vaga (sem transação; é leitura).
   Se `null`, `ActionError` com a mesma frase de sempre.
2. `getActiveRound()` → `marketOpen`.
3. `listMarketLockMatches()` → `lockedOrganizations(...)` → `lockedTeams`.
4. `resolveMarketScope(toTeamRegion(team.region))` → `scope`.
5. `getMarketByRole(PLAYER_ROLES, scope)` → o catálogo.
6. `marketMatchesFor(lockMatches, region)` → `nextMarketClose(...)` → `closesAt` (ver Parte 4).

Retorna `{ market, scope, balanceCents, marketOpen, lockedTeams, closesAt, closesIn }` — tudo
relido no instante do clique, inclusive o saldo. Sem `revalidatePath` (é leitura).

### `app/(app)/my-team/page.tsx`

Remove a chamada a `getMarketByRole` (linha 45) e as props `market`/`scope` do `<RosterPanel>`.
Ganha `closesAt` do `summary.market`. O HTML da página deixa de carregar o catálogo inteiro.

### `components/team/roster-panel.tsx`

- `useAction(loadMarket)` num quarto hook.
- `handleSelect` passa a disparar, além do `setSelectedIndex`: `executeLoadMarket({ slotId })`
  **e** `router.refresh()` — o primeiro alimenta o Sheet, o segundo mantém o "Resumo"/"Time
  Montado" atrás dele em dia (agora barato, sem catálogo no payload).
- O Sheet abre no mesmo tick de sempre. Enquanto `loadMarket` corre, o `MarketSheet` recebe
  `market: null`; `balanceCents`/`marketOpen`/`lockedTeams`/`closesAt` seguem vindo das props da
  página e são **substituídos** pelo retorno da action quando ele chega.
- Depois de uma compra/venda bem-sucedida o Sheet fecha (`setSelectedIndex(null)`), como hoje —
  o `revalidatePath("/my-team")` das actions continua sendo o que atualiza o saldo na tela.
  Reabrir a vaga dispara `loadMarket` de novo, então nunca há catálogo reaproveitado.

### `components/market/market-sheet.tsx`

- `market: Record<PlayerRole, Player[]> | null` e `scope: MarketScope | null`.
- Com `market === null`: cabeçalho, `MarketSummaryBar` e o bloco de venda renderizam normalmente
  (dados de página); a área da lista mostra um skeleton de três linhas com
  `aria-busy`/`aria-live="polite"` e o texto "Carregando o mercado…". As abas ficam
  desabilitadas nesse estado.
- `initialRole` e `candidatesByRole` já são `useMemo` guardados por `ctx` — só precisam tolerar
  `null`.

---

## Parte 3 — Auto-refresh leve na `/my-team`

`<LiveRefresh>` já existe e já resolve o caso difícil (pausa em aba escondida, atualiza ao
voltar). Não se reescreve nada — **move-se**:

- `components/home/live-refresh.tsx` → `components/layout/live-refresh.tsx` (com o `.test.tsx`);
  atualizar o import de `app/(app)/home/page.tsx`. É componente de infraestrutura, não da Home.
- `app/(app)/my-team/page.tsx` renderiza `<LiveRefresh intervalMs={myTeamRefreshMs(closesAt)} />`.

**Nova função pura em `lib/market/window.ts`:**

```ts
export function myTeamRefreshMs(closesAt: Date | null, now?: Date): number;
```

Perto do fechamento (≤ 1h, o `MARKET_CLOSE_LEAD_MS` que já está no arquivo) devolve
`LIVE_REFRESH_MS`; caso contrário `IDLE_REFRESH_MS`. As duas constantes são reexportadas de
`lib/home/summary.ts:247-250` — mover para `lib/market/window.ts` e reexportar de `summary.ts`,
para não haver dois números de cadência no projeto. Sem consulta extra: `closesAt` já está na
mão.

---

## Parte 4 — O fechamento certo, tickando

### `lib/market/window.ts` — nova função pura

```ts
export function marketMatchesFor(
  matches: readonly RoundMatch[],
  region: TeamRegion,
): RoundMatch[];
```

Recorta por `eventRegion(match.event, match.regionCode)` (`lib/round/regions.ts:180`):

- time `international` → só partidas de `eventRegion === "international"`;
- time de liga → `eventRegion === region` **ou** `"international"`.

O internacional entra nos dois casos porque ele **de fato tranca**: se um Masters fechou hoje,
`lockedOrganizations` trava toda organização que joga lá, Americas incluídas. Um recorte só por
região mostraria um fechamento que não é o que vai travar o usuário.

**`lockedOrganizations` continua global e intocada** — a trava já é por organização, e está
certa. O recorte é só do número que a tela exibe.

### `lib/team/queries.ts`

`loadTeamOverview:161` passa a usar `nextMarketClose(marketMatchesFor(lockMatches, region))`.
Uma linha; `region` já está no escopo da função.

### `components/market/market-countdown.tsx` (movido de `components/home/`)

O componente é de domínio de mercado e passa a ter dois consumidores (`UpcomingMatches` e
`MarketSummaryBar`) — mover e atualizar os dois imports mais o `.test.tsx`.

Ganha uma prop opcional:

```ts
formatter?: (closesAt: Date, now?: Date) => string; // default: formatMarketClose
```

A Home continua com o default ("Mercado fecha em 7h 0m"); a `MarketSummaryBar`, que já tem o
rótulo "Mercado" em cima, passa `formatTimeLeft` e mostra só "7h 0m". Ambas as funções já
existem em `lib/market/window.ts` com a mesma assinatura.

### `components/market/market-summary-bar.tsx`

Nova prop `closesAt: Date | null`. O `Stat` "Mercado" renderiza `<MarketCountdown>` quando
`marketOpen && closesAt`; senão mantém o texto atual (`"Fechado"`, `"Nenhum jogo marcado"`,
`"Nenhuma rodada ativa"` — as três frases já vêm prontas de `lib/team/mappers.ts:90-94`).
`closesIn` continua servindo de `initialCountdown`, pelo mesmo motivo da Home: primeiro paint
igual no servidor e no cliente.

`closesAt` viaja `page → RosterPanel → MarketSheet → MarketSummaryBar`, e é sobrescrito pelo
retorno de `loadMarket` quando ele chega.

---

## Saldo (task 4 do prompt)

Conferido, sem alteração estrutural: toda mutação de saldo já é `db.transaction` com
`balanceAfterCents` calculado por `evaluateSubstitution`/`evaluateSale`, seguida de
`revalidatePath("/my-team")` e `revalidatePath("/home")`. As Partes 2 e 3 reforçam isso de
graça — o saldo agora é relido no clique **e** no ciclo de auto-refresh. Se a checagem revelar
algum caminho sem revalidação, corrijo ali mesmo e registro no resumo final.

---

## Arquivos

**Novos:** `deploy/vlr-cron/{crontab,Dockerfile,docker-compose.yml,README.md}`,
`components/market/market-summary-bar.test.tsx`.

**Movidos:** `components/home/live-refresh.tsx(.test.tsx)` → `components/layout/`;
`components/home/market-countdown.tsx(.test.tsx)` → `components/market/`.

**Modificados:** `app/(app)/my-team/{page.tsx,actions.ts,actions.test.ts}`,
`app/(app)/home/page.tsx`, `components/team/roster-panel.tsx(.test.tsx)`,
`components/market/market-sheet.tsx(.test.tsx)`, `components/market/market-summary-bar.tsx`,
`components/home/upcoming-matches.tsx`, `lib/market/window.ts(.test.ts)`,
`lib/team/queries.ts`, `lib/home/summary.ts`, `lib/validations/market.ts`, `docs/SCRAPING.md`.

**Context7 durante a implementação** (regra do CLAUDE.md): `next-safe-action` (action que
devolve dados + o shape de `result.data` em `useAction`) e `/vercel/next.js` (`router.refresh()`
com Server Action concorrente, App Router 16).

---

## Testes (React Testing Library, banco mockado)

- `lib/market/window.test.ts` — `marketMatchesFor` (liga recorta e mantém internacional;
  internacional exclui liga) e `myTeamRefreshMs` (≤1h → live; longe → idle; `null` → idle).
- `app/(app)/my-team/actions.test.ts` — `loadMarket`: exige sessão; deriva a região do **slot**,
  não do input; devolve `marketOpen: false` sem rodada ativa; `ActionError` para slot de outro
  usuário. `db` mockado direto, como os testes atuais do arquivo.
- `components/market/market-sheet.test.tsx` — abre com `market: null` mostrando o skeleton e a
  `MarketSummaryBar` já preenchida; troca para a lista quando `market` chega; abas desabilitadas
  no estado de carregamento. Os casos existentes passam a montar com o catálogo já resolvido.
- `components/team/roster-panel.test.tsx` — clicar numa vaga dispara `loadMarket` com o `slotId`
  daquela vaga; vaga travada não dispara nada.
- `components/market/market-summary-bar.test.tsx` (novo) — mostra o countdown com
  `marketOpen && closesAt`; mostra "Fechado" com o mercado fechado; usa o texto do servidor no
  primeiro paint.
- `components/market/market-countdown.test.tsx` — um caso a mais para a prop `formatter`.

## Verificação

1. `pnpm test` — tudo verde (é a regra do CLAUDE.md: nada é entregue sem isso).
2. `pnpm lint` e `pnpm build`.
3. `pnpm dev`, `/my-team`: abrir o DevTools › Network, clicar numa vaga — confirmar que o HTML
   da página **não** traz mais o catálogo e que a lista chega por uma chamada de Server Action.
4. Confirmar que o "Mercado" do modal bate com o painel "Próximos jogos" da Home **filtrado pela
   mesma região**, e que o número anda sozinho (ticks de 30s) sem F5.
5. Comprar e vender: saldo do modal e do `TeamStats` mudam juntos, sem recarregar a página.
6. `docker compose -f deploy/vlr-cron/docker-compose.yml run --rm vlr-cron pnpm vlr:doctor` —
   prova que o container enxerga banco e rede; `... pnpm vlr:results --force --pages=1` seguido
   de `pnpm vlr:reprocess --match=<vlrId>` prova que o volume preservou o HTML bruto.
7. Copiar este plano para `.claude/plans/11-mercado-sempre-atualizado.md` (regra do CLAUDE.md).
