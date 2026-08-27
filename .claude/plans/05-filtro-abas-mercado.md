# Mercado: abas por função, ordem por preço e venda evidente

> Origem: `prompts/05_filter_player_to_buy.md`
> Ao aprovar, este plano também é salvo em `.claude/plans/05-filtro-abas-mercado.md`
> (regra do `CLAUDE.md`), substituindo o rascunho já criado lá.

## Context

O `MarketSheet` (`components/market/market-sheet.tsx`) hoje entrega uma
experiência de compra que atrapalha três decisões básicas do usuário:

1. **Achar um jogador de uma função.** Numa vaga vazia, as quatro funções vêm
   empilhadas como quatro listas com `<h3>` dentro de um único `ScrollArea`
   (`market-sheet.tsx:209-227`) — para chegar num Sentinela é preciso rolar
   Duelistas, Iniciadores e Controladores inteiros.
2. **Achar um jogador que ele consegue pagar.** A ordem vem de
   `getMarketByRole` (`lib/team/queries.ts:113`) como `desc(score), asc(nickname)`,
   depois particionada por `sortByEligibility` (`market-sheet.tsx:63`) em
   elegíveis → bloqueados. Ou seja: do maior score para o menor, não do mais
   barato para o mais caro.
3. **Vender.** A venda pura existe (`sellPlayer`, `app/(app)/my-team/actions.ts:133`)
   mas vive num bloco com cara de nota de rodapé dentro do Sheet
   (`market-sheet.tsx:150-175`), atrás de um clique numa vaga ocupada. Quem não
   abre o mercado nunca descobre que dá para vender.

Some a isso o ruído nos cards: cada candidato mostra a pontuação da rodada
(via `PlayerIdentity` → `PlayerScore`), o preço, **e** uma projeção
`{netCost} · saldo {balanceAfter}` — três números para uma decisão que precisa
de um.

Além disso, uma regra de produto muda: **a substituição não é mais restrita à
mesma função**. O usuário pode escalar cinco Duelistas se quiser. Isso remove o
bloqueio `role-mismatch` e é o que torna as abas de função úteis também na
substituição, não só na vaga vazia.

**Resultado esperado:** abrir o mercado (por qualquer vaga) e ver abas das
quatro funções; escolher uma aba e ver os jogadores do mais barato para o mais
caro, com os inacessíveis no fim; cada card com um número só — o preço atual do
jogador; e a venda como ação visível tanto em "Meu Time" quanto no Sheet.

---

## Decisões fechadas

| #   | Decisão                                                                                             |
| --- | --------------------------------------------------------------------------------------------------- |
| D1  | Substituição livre entre funções — `role-mismatch` deixa de existir; abas nos dois modos            |
| D2  | Venda promovida **dentro do Sheet** e exposta como botão na linha do jogador em "Meu Time" (Resumo) |
| D3  | Venda é **ação direta** — sem diálogo de confirmação, só o toast atual                              |
| D4  | Card mostra **só o preço cheio**; o crédito de quem sai aparece uma vez, no `MarketSummaryBar`      |

---

## 1. Domínio — liberar a troca entre funções

`lib/market/eligibility.ts`

- Remover `"role-mismatch"` de `BlockReason` (:8), de `REASON_LABELS` (:35), do
  encadeamento de precedência de `evaluateSubstitution` (:66-67) e do `switch`
  de `blockReasonMessage` (:124-129).
- A precedência passa a ser: `market-closed` → `player-inactive` →
  `same-player` → `already-rostered` → `insufficient-balance`. Atualizar o
  JSDoc (:39-53), que descreve a ordem e diz que `role-mismatch` só é
  alcançável com `ctx.outgoing`.
- `blockReasonMessage` perde o segundo parâmetro `requiredRole` — nenhuma
  mensagem restante o usa. Assinatura vira `blockReasonMessage(reason: BlockReason)`.

Call sites do parâmetro removido:

- `components/market/market-player-row.tsx:93` — `blockReasonMessage(verdict.blockedBy!, ctx.outgoing?.role ?? null)` → `blockReasonMessage(verdict.blockedBy!)`
- `app/(app)/my-team/actions.ts:96` e `:169`

Nada muda no banco: `db/schema/roster.ts` não tem `role` na vaga (o comentário
no topo do arquivo já registra que a função vinha de quem sai — atualizar esse
comentário, que passa a estar errado).

`app/(app)/my-team/page.tsx:31-38`

- Some a derivação `rolesEscaladas` / `temVagaVazia`: o mercado agora é sempre
  `await getMarketByRole(PLAYER_ROLES)`, porque toda função é contratável em
  qualquer vaga.

## 2. Ordenação: mais barato → mais caro, bloqueados por último

Novo módulo puro `lib/market/ordering.ts`:

```ts
/**
 * Ordem de exibição do mercado: quem o usuário pode contratar primeiro, do
 * mais barato para o mais caro; quem está bloqueado (sem saldo, já escalado,
 * indisponível) depois, na mesma ordem de preço. Empate de preço desempata
 * por nickname, para a ordem ser estável entre renders e idêntica no
 * servidor e no cliente.
 */
export function sortMarketCandidates(
  candidates: readonly Player[],
  ctx: SubstitutionContext,
): Player[];
```

- Critério: `blocked ? 1 : 0` → `priceCents` asc → `nickname` asc.
  Reusa `evaluateSubstitution` de `lib/market/eligibility.ts` para o `blocked` —
  não reimplementar regra.
- Substitui `sortByEligibility` em `market-sheet.tsx:63-72`, que é apagada.
- Alinhar `getMarketByRole` (`lib/team/queries.ts:113`) para
  `orderBy: (row, { asc }) => [asc(row.priceCents), asc(row.nickname)]`, para o
  HTML do servidor já chegar quase na ordem final.

## 3. Abas de função no `MarketSheet`

- Instalar o componente: `pnpm dlx shadcn@latest add tabs`. Não existe em
  `components/ui/` hoje; `radix-ui` já é dependência do projeto, então nenhum
  pacote novo entra. Confirmar a API atual via **Context7** antes de escrever.
- Estrutura nova dentro do `SheetContent`:
  - `MarketSummaryBar` (topo, fixo)
  - bloco de venda (só com vaga ocupada — ver §4)
  - `<Tabs>` com `<TabsList>` **fora** da área rolável, uma `<TabsTrigger>` por
    função de `PLAYER_ROLES`, e um `<TabsContent>` por função com seu próprio
    `ScrollArea` (mantendo o `min-h-0 flex-1` já comentado em `market-sheet.tsx:188-195`
    — é ele que faz a rolagem funcionar dentro do Sheet).
- Aba inicial: a função de quem sai (`outgoing.role`) numa substituição; a
  primeira função de `PLAYER_ROLES` com candidatos numa vaga vazia.
- Função sem candidato: `TabsTrigger` desabilitado, aba continua visível para o
  layout não dançar entre rodadas. `TabsContent` vazio mostra a mensagem
  "Nenhum {função} disponível no mercado."
- O tipo `CandidateGroup` e a flag `showHeader` somem — a aba é o rótulo,
  os `<h3>` de função saem.
- Textos do cabeçalho, hoje presos à regra antiga:
  - Título: `Mercado · Substituir {nickname}` / `Mercado · Vaga {position}`
  - Descrição da substituição (`market-sheet.tsx:136`) deixa de dizer
    "Só aparecem jogadores da mesma função" — passa a explicitar o contrário,
    ex.: "Substituindo {nickname}. Escolha qualquer função."
  - JSDoc do componente (`market-sheet.tsx:74-79`) idem.

## 4. Venda evidente

**No Sheet** — o bloco de `market-sheet.tsx:150-175` vira uma seção de primeira
classe logo abaixo do `MarketSummaryBar`:

- Rótulo legível "Vender {nickname}" e o crédito que entra em destaque
  (`formatCreditsDelta(saleVerdict.proceedsCents)`).
- Botão `variant="destructive"` de largura total, no lugar do `outline` `size="sm"`.
- Remove o `· saldo {balanceAfterCents}` (coerência com D4 — mostra-se só quanto
  o usuário **recebe**).

**Em "Meu Time"** — botão "Vender" na linha do jogador:

- `PlayerRow` (`components/team/player-row.tsx:160`) ganha
  `onSell?: () => void`, renderizado como botão irmão do botão de substituir
  (nunca aninhado — mesma razão já documentada para `CaptainBadge`).
- **Cuidado com o hover:** a regra `has-[>button:hover]` (`player-row.tsx:179-180`)
  acende o card quando qualquer `<button>` filho direto sofre hover. Com um
  segundo botão direto, o card acenderia ao passar por "Vender" também.
  Marcar o botão de substituir com um atributo (ex. `data-slot="substitute"`) e
  estreitar a regra para `has-[>[data-slot=substitute]:hover]`.
- `RosterPanel` (`components/team/roster-panel.tsx:117`) — `handleSell` hoje
  depende de `selectedSlot`. Extrair uma variante por índice
  (`handleSellAt(index)`) que lê `roster[index]` e chama a mesma
  `executeSell({ slotId, outgoingPlayerId })`; o `handleSell` do Sheet passa a
  ser um caso dela. Só passar `onSell` quando `marketOpen && slot.id`.
- Sem confirmação (D3): clique → `executeSell` → toast "Jogador vendido!".

## 5. Cards de contratação: um número só

`components/team/player-row.tsx` — `PlayerIdentity` (:117)

- Ganha `trailing?: React.ReactNode`, com o `<PlayerScore>` atual como padrão.
  Nenhum call site de "Meu Time" muda; a pontuação continua lá.

`components/market/market-player-row.tsx`

- Passa `trailing={<PlayerPrice priceCents={candidate.priceCents} />}` — o preço
  atual ocupa o lugar da pontuação da rodada.
- Remove o `<PlayerPrice>` duplicado da segunda linha (:59-63) e a projeção
  `{formatCreditsDelta(netCost)} · saldo {formatCredits(balanceAfter)}` (:70-73).
- `verdict` continua sendo consultado para `blockedBy` (badge, mensagem e
  `aria-disabled`) — só a projeção sai da tela.
- Com o preço subindo para a linha de identidade, a segunda linha fica só com
  badge de bloqueio + botão "Contratar"; revisar se o card ainda precisa das
  duas linhas empilhadas (o JSDoc em :26-36 explica por que foram empilhadas).

`components/market/market-summary-bar.tsx` (D4)

- A coluna "Sai" passa a mostrar o nickname **e** o crédito que a saída gera:
  `{outgoing.nickname}` + `formatCreditsDelta(outgoing.priceCents)`. É o único
  lugar onde o abatimento aparece, uma vez, em vez de repetido em cada card.

---

## Verificação

Testes (RTL, DB mockado — `CLAUDE.md`); usar a skill `react-testing-library`.

`lib/market/eligibility.test.ts`

- Remover os casos de `role-mismatch` (:54, :134, :140) e **inverter** o de :54:
  contratar um Controlador no lugar de um Duelista agora é permitido.
- Ajustar as chamadas de `blockReasonMessage` à assinatura de um parâmetro.

`lib/market/ordering.test.ts` (novo)

- Ordem por preço asc; bloqueados no fim mantendo preço asc; desempate por
  nickname.

`components/market/market-sheet.test.tsx`

- As quatro abas aparecem como `role="tab"` nos dois modos; clicar em
  "Sentinela" troca a lista.
- Substituição: a aba inicial é a função de quem sai, **e** candidatos de outra
  função são contratáveis (o teste :38 "lista só candidatos da mesma função"
  inverte de sentido).
- Ordem: com preços 3000/1000/2000 mais um bloqueado barato, os `listitem` saem
  1000, 2000, 3000, bloqueado.
- Aba sem candidatos fica desabilitada.
- Venda: o texto passa a ser só o crédito (`+40.0`), sem `· saldo 140.0` (:212).
- Os testes de `<h3>` de função (:283, :305, :308) passam a mirar abas.
- Descrição da substituição (:81) muda de texto.

`components/market/market-player-row.test.tsx`

- Card mostra o preço atual; não mostra pontuação nem projeção de saldo.
- Bloqueio continua com badge, mensagem e botão travado.

`components/team/player-row.test.tsx`

- Regressão do `trailing` padrão: "Meu Time" continua mostrando a pontuação.
- Botão "Vender" aparece com `onSell` e some sem ele; hover do card não é
  disparado pelo botão de vender.

`components/team/roster-panel.test.tsx`

- Clicar em "Vender" na linha dispara `sellPlayer` com o `slotId` daquela vaga.
- Com o mercado fechado, o botão não é renderizado.

Comandos:

```
pnpm test
pnpm lint
pnpm exec prettier --write .
```

Manual (`pnpm dev`, `/my-team`, mercado aberto):

1. Vaga vazia → abas das quatro funções, lista do mais barato ao mais caro,
   bloqueados no fim.
2. Vaga ocupada → abre na aba da função de quem sai; contratar alguém de
   **outra** função funciona ponta a ponta (saldo e vaga atualizados).
3. Card mostra um número só (o preço); o crédito da saída aparece no topo.
4. "Vender" visível na linha do Resumo sem abrir o Sheet; venda esvazia a vaga
   e credita o saldo.
