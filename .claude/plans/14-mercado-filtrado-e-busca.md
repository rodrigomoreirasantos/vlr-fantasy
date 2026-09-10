# Mercado filtrado: só quem dá para contratar, na ordem certa, achável pelo nome

## Context

`prompts/14_filter_market_players.md` pede três coisas do modal do mercado (o `<MarketSheet>` que
abre ao clicar numa vaga da Escalação, entregue no plano 11):

1. **Jogador de organização travada não deveria aparecer.** Hoje ele aparece: o catálogo vem do banco
   sem saber da trava do dia (`getMarketByRole`, `lib/team/queries.ts:241-246`, filtra só `role`,
   `active` e escopo), e quem descobre o bloqueio é `evaluateSubstitution` já no cliente, card a card.
   O resultado é uma lista poluída de "Contratar" desabilitado.
2. **A barra de resumo mostra o que não interessa.** `Saldo | Vaga | Mercado` — e desde o plano 12 o
   saldo já vive permanentemente no header, enquanto "Vaga" repete o número que o próprio título do
   Sheet já diz ("Escolha um jogador para a vaga 3").
3. **Não dá para procurar por nome.** Não existe nenhum campo de busca no projeto inteiro — nem um
   `type="search"`, nem debounce. O único padrão de filtro existente é por chips de seleção
   (`components/home/filter-chip.tsx`).

**Resultado esperado:** ao abrir uma vaga, a lista traz apenas quem o mercado permite escalar agora,
do mais caro para o mais barato; o topo responde "quanto posso gastar" e "quanto tempo tenho"; e um
campo de busca acha o jogador pelo nome conforme se digita, em qualquer uma das quatro funções.

## Decisões (respondidas pelo usuário)

| #   | Pergunta                                                                                    | Decisão                                                                                                       |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | O prompt diz que o bloqueado "não deve aparecer" **e** "deve aparecer bloqueado". Qual vale? | Some da lista — **só** por `market-closed`. Os outros 6 motivos seguem visíveis, bloqueados, no fim.             |
| 2   | Ordem do mais caro para o mais barato — e o toggle Preço/A-Z recém-entregue?                 | Toggle de **três** estados: Preço ↓ (padrão), Preço ↑, A-Z.                                                      |
| 3   | O que a barra de resumo mostra no lugar de VAGA e MERCADO?                                   | Saldo, quanto dá para gastar nesta troca, e o fechamento tickando.                                                |
| 4   | A busca por nome age em qual escopo?                                                         | Nas quatro funções ao mesmo tempo, com **contador em cada aba** (sem trocar de aba sozinho).                      |
| 5   | Onde ficam busca e ordenação?                                                                | Na **mesma linha, abaixo da `TabsList`** (o toggle sai de cima do `Tabs`).                                        |

## Invariantes que não podem quebrar

- **A regra de bloqueio é uma só.** `evaluateSubstitution` (`lib/market/eligibility.ts:86-109`) é a
  fonte de verdade, usada pela UI e **de novo** pela Server Action dentro da transação
  (`app/(app)/my-team/actions.ts:101-115`). Esconder card no cliente não afrouxa nada. Esta feature é
  100% exibição: **nenhuma mudança em action, schema, query ou migration.**
- **`no-round` vem antes de `market-closed`** (`eligibility.ts:94-95`). Sem rodada ativa ninguém é
  `market-closed`, então a lista **não** esvazia — continua inteira, bloqueada, sob o alerta "Mercado
  fechado" que já existe (`market-sheet.tsx:207-216`). Isso é acidental hoje e vira **teste de
  regressão** (§Testes): inverter esses dois `if`s no futuro transformaria "mercado fechado" numa tela
  vazia sem explicação.
- **`market-closed` cobre os dois lados da troca** (`eligibility.ts:96-98`): se a organização de **quem
  sai** está travada, *todo* candidato vira `market-closed` — e o filtro esvaziaria as quatro abas.
  `slotIsOpen` (`components/team/roster-panel.tsx:127-131`) normalmente impede abrir uma vaga assim,
  mas decide com o `lockedTeams` **das props da página**, enquanto `loadMarket` relê a trava fresca
  **depois** do clique. Na janela entre um render e o clique dá para cair nesse caso. Tratado por um
  guard explícito na Fase 1.
- **Bloqueados sempre por último** (`ordering.ts:35`) continua valendo para os 6 motivos que
  sobrevivem — é o que neutraliza o efeito colateral de `price-desc` (o caro inacessível não sobe para
  o topo). Vale um comentário no código para ninguém "otimizar" essa regra fora.

---

## Fase 1 — Domínio: avaliar uma vez, esconder, buscar, ordenar

**Novo:** `lib/market/search.ts` · **Muda:** `lib/market/ordering.ts`, `lib/market/eligibility.ts`

### 1.1 Normalização da busca (`lib/market/search.ts`)

Reusa a receita que já existe na casa — `slugifyUsername` (`lib/auth/username.ts:32-40`) faz
`normalize("NFD")` + remoção de diacríticos + `toLowerCase()`. Zero dependência nova.

```ts
export function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos (após normalize("NFD"))
    .toLowerCase()
    .trim();
}
```

**Não** copiar o `.replace(/[^a-z0-9_.]/g, "")` do `slugifyUsername`: ali serve para gerar login, aqui
destruiria nicknames com hífen e número. **Substring, não prefixo** — "spa" acha "aspas". `trim()` só
nas bordas.

### 1.2 Pipeline em dois estágios (`lib/market/ordering.ts`)

Hoje `sortMarketCandidates` chama `evaluateSubstitution` **dentro do comparador** (`ordering.ts:33-35`):
O(n log n) avaliações da mesma regra. Como agora o veredito também decide quem some e alimenta os
contadores, ele passa a ser calculado **uma vez por candidato** e a viajar junto.

```ts
export type MarketSortOrder = "price-desc" | "price-asc" | "alphabetical";
export const DEFAULT_MARKET_SORT: MarketSortOrder = "price-desc";

/** Um candidato já julgado — o veredito viaja com ele. */
export type MarketCandidate = { player: Player; verdict: Verdict };

/** Estágio 1 — depende só de (catálogo, contexto). Avalia e esconde os `market-closed`. */
export function evaluateMarketCandidates(
  candidates: readonly Player[],
  ctx: SubstitutionContext,
): MarketCandidate[];

/** Estágio 2 — depende de (lista julgada, termo, ordem). Roda a cada tecla. */
export function filterAndSortMarketCandidates(
  evaluated: readonly MarketCandidate[],
  options?: { query?: string; order?: MarketSortOrder },
): MarketCandidate[];
```

**Por que dois estágios:** o veredito depende de `ctx`/catálogo, o termo não. Assim digitar uma letra
não reavalia a elegibilidade dos ~40 candidatos — só refaz um `filter` + `sort`.

**O guard obrigatório**, dentro do estágio 1:

```ts
const outgoingLocked =
  ctx.outgoing !== null && isTeamLocked(ctx.lockedTeams, ctx.outgoing.team);
// por candidato:
const hidden = verdict.blockedBy === "market-closed" && !outgoingLocked;
```

Sem `!outgoingLocked`, o caso "quem sai travado" esvazia as quatro abas. Com ele, a lista continua
inteira e bloqueada — a resposta honesta, porque o problema não é o candidato. **Complemento
recomendado:** nesse caso o Sheet mostra um `<Alert>` (mesmo padrão de `market-sheet.tsx:207-216`)
dizendo "O mercado da organização de {nickname} fechou hoje", em vez de deixar o usuário decifrar 40
badges iguais.

**Ordenação:** bloqueados por último; depois `price-desc` (padrão) / `price-asc` / `alphabetical`.
Preço empatado desempata por nickname. Padronizar `localeCompare(x, "pt-BR")` — hoje `ordering.ts:37,40`
chama sem locale, e `lib/player/form.ts:159` já usa o locale (é o que faz "aspas" vir antes de "TenZ").

**A busca fica no domínio, não no JSX** — porque o contador de cada aba é `length` da mesma lista que
é renderizada. Filtrar no componente obrigaria a rodar o predicado duas vezes (contar e listar), que é
exatamente onde nasce o "aba diz 3, lista mostra 2".

### 1.3 O teto de compra (`lib/market/eligibility.ts`)

```ts
/** Teto de compra: o preço máximo que um candidato pode ter sem cair em `insufficient-balance`. */
export function spendingCapCents(balanceCents: number, outgoing: Player | null): number {
  return balanceCents + (outgoing?.priceCents ?? 0);
}
```

Não é invenção de UI: `insufficient-balance` dispara quando `netCostCents > balanceCents`
(`eligibility.ts:90,104`), ou seja quando `incoming.priceCents > balanceCents + outgoing.priceCents`.
É a mesma conta da regra, com nome — e é o número da Fase 4.

---

## Fase 2 — `MarketSheet`: estado, memos e o reset ao trocar de vaga

**Muda:** `components/market/market-sheet.tsx`

`RosterPanel` mantém o `<MarketSheet>` **sempre montado**, alternando só `open`
(`roster-panel.tsx:246-261`) — `useState` sobrevive a fechar e reabrir. Com `sortOrder` isso não
incomoda; com `query` é bug de cara: sair de uma vaga com "derke" digitado abriria a próxima com as
quatro abas aparentemente vazias. (De quebra, isso prova que o JSDoc de `market-sheet.tsx:79-80` — "não
persiste entre aberturas" — é falso hoje.)

**Reset por ajuste de estado durante o render** (padrão oficial do React para "adjusting state when a
prop changes"; sem `useEffect`, sem flash):

```ts
const slotKey = `${selection?.position ?? "none"}-${outgoing?.id ?? "empty"}`;
const [lastSlotKey, setLastSlotKey] = useState(slotKey);
if (slotKey !== lastSlotKey) {
  setLastSlotKey(slotKey);
  setQuery("");
  setSortOrder(DEFAULT_MARKET_SORT);
}
```

Dois detalhes que fazem isso funcionar:

- `selection` vira `null` ao fechar (`roster-panel.tsx:146-151`), então reabrir a **mesma** vaga também
  começa limpo.
- `slotKey` **não inclui** `market !== null`, ao contrário do `key` do `Tabs` (`market-sheet.tsx:271`).
  É deliberado: o `Tabs` precisa remontar quando o catálogo chega (motivo em `:255-270`), mas a busca
  não pode ser apagada nesse instante — o usuário pode ter começado a digitar sobre o skeleton. E
  `query` **jamais** entra no `key` do `Tabs`: cada tecla remontaria as abas e jogaria o usuário de
  volta para a inicial.

**Os dois memos** (substituem `candidatesByRole`, `market-sheet.tsx:130-138`): `visibleByRole` com deps
`[ctx, market]` (estágio 1) e `listByRole` com deps `[visibleByRole, query, sortOrder]` (estágio 2),
mais `const searching = query.trim() !== ""`. `initialRole` (`:143-149`) passa a olhar **`visibleByRole`** —
a aba inicial não pode depender de um termo de busca.

Sem debounce e sem `useDeferredValue` na v1: dezenas de itens, estágio 1 fora do caminho, e o prompt
pede resposta a cada letra. Fica anotado no código como o escape se o catálogo crescer.

---

## Fase 3 — `MarketSheet`: controles, contadores, estados vazios

**Muda:** `components/market/market-sheet.tsx`

### Faixa de controles (decisão 5)

O bloco de ordenação sai de cima do `<Tabs>` (`market-sheet.tsx:220-253`) e vira uma linha logo abaixo
de `</TabsList>`, ainda dentro do `<Tabs>`: `<Input type="search">` (`flex-1 min-w-0`, ícone `Search` do
lucide `aria-hidden`, `aria-label="Buscar jogador pelo nome"`) + o `<ToggleGroup>` à direita. O guard
`{visibleByRole && …}` continua (não se oferece busca sobre skeleton), o rótulo "Ordenar por" some (o
`aria-label` do grupo já nomeia), e o tratamento do `""` do Radix (`:230-234`) fica.

| `value`        | Visível (seta `aria-hidden`) | `aria-label`                                  |
| -------------- | ---------------------------- | --------------------------------------------- |
| `price-desc`   | `↓ Preço`                    | `Preço: do mais caro para o mais barato`      |
| `price-asc`    | `↑ Preço`                    | `Preço: do mais barato para o mais caro`      |
| `alphabetical` | `A-Z`                        | `A-Z: ordem alfabética`                        |

`ToggleGroup type="single"` já rende `role="radiogroup"`/`role="radio"` — semântica certa para três
estados exclusivos. Espaço é o risco real (Sheet tem `sm:max-w-lg`): `size="sm"`, texto minúsculo e
`min-w-0` no input; se não couber no mobile, o plano B é o toggle virar `<Select>` (custa mais testes,
só com medição na mão).

### Contadores (decisão 4)

No `TabsTrigger` (`:276-288`), um `<span className="tabular-nums">` com `listByRole[role].length`
**só quando `searching`** — sem busca o número seria ruído, e essa escolha preserva de graça as ~12
asserções `getByRole("tab", { name: "Duelista" })` já existentes.

**`disabled` continua amarrado à contagem NÃO filtrada** (`visibleByRole[role].length === 0`). É a
correção mais importante desta fase: se seguisse a busca, digitar um termo que só casa em Sentinela
desabilitaria a aba ativa, o Radix perderia o painel e o usuário ficaria sem lista **e** sem como
navegar até onde estão os resultados. Assim, uma aba com candidatos e zero matches fica **habilitada
mostrando `0`** — que é a informação útil. E **nunca** trocar de aba sozinho (rouba o foco no meio da
digitação).

### Estados vazios

| Condição                                                                   | Mensagem                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `visibleByRole[role]` vazio **e** `market[role]` vazio                     | `Nenhum {role} disponível no mercado.` (**string intocada** — dois testes dependem dela) |
| `visibleByRole[role]` vazio **mas** `market[role]` tem gente               | `Nenhum {role} com mercado aberto agora.`                                 |
| `searching` e `listByRole[role]` vazio com `visibleByRole[role]` com gente | `Nenhum {role} corresponde a "{query}".` + botão **Limpar busca**         |

A segunda linha é a parte do plano que **não** pode ser cortada por escopo: é ela que impede o efeito
colateral pior da decisão 1 — sumir sem dizer por quê. Sai de graça comparando `market[role].length`
com `visibleByRole[role].length`.

### Acessibilidade

Uma região viva anuncia o resultado da busca, colocada **fora de `<TabsContent>`** (o Radix desmonta
painéis inativos, e live region desmontada não anuncia):

```tsx
<p role="status" className="sr-only">
  {searching ? `${total} jogadores encontrados para “${query}”.` : ""}
</p>
```

`total` soma as quatro funções — o usuário quer saber se o jogador existe em *alguma* aba. `role="status"`
já implica `aria-live="polite"`, mesmo idioma de `market-sheet.tsx:334`.

---

## Fase 4 — `MarketSummaryBar`: Saldo · Pode gastar · Fecha em

**Muda:** `components/market/market-summary-bar.tsx`

| Hoje                                      | Vira                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Saldo` → `PlayerPrice(balanceCents)`     | **mantém**                                                                                                                         |
| `Sai`/`Vaga` → nickname ou número da vaga | **`Pode gastar`** → `PlayerPrice(spendingCapCents(...))`, com sub-linha `{formatCreditsDelta(outgoing.priceCents)} com {nickname}` |
| `Mercado` → countdown                     | **`Fecha em`** → mesmo `<MarketCountdown>`; rótulo dinâmico, volta a "Mercado" sem `closesAt` (senão vira "FECHA EM: Nenhum jogo marcado") |

**Por que "Pode gastar" e não "Sobra após a troca":** antes de escolher um candidato não existe sobra,
existe teto — e o teto é o número que de fato governa quais cards ficam "Sem saldo". É a leitura
honesta da decisão 3; trocar o rótulo é uma linha.

**Vaga vazia:** teto === saldo, e duas células repetiriam o número. A célula do meio **não é
renderizada** e a grade vira `grid-cols-2` (`:61` condicional via `cn`). Nada se perde: o nickname de
quem sai migra para a sub-linha de "Pode gastar" (onde passa a *explicar* o número), e o número da vaga
já está no `SheetDescription` (`market-sheet.tsx:164-166`). Bordas passam a ser
`[&>*+*]:border-l` no container, agnóstico à contagem de colunas. A prop `position` sai de
`MarketSummaryBarProps`. Segue Server Component.

---

## Testes (RTL, banco mockado — regra do `CLAUDE.md`)

**Quebram** (mapeados, com o valor novo):

| Arquivo:linha                          | Por quê                                                                       | Ajuste                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `lib/market/ordering.test.ts:39,51`    | padrão virou `price-desc`                                                     | `["Caro","Medio","Barato"]`; irmão novo com `order:"price-asc"`     |
| `ordering.test.ts:83,94,106`           | assinatura/retorno (`MarketCandidate`)                                        | `.map(c => c.player.nickname)`                                      |
| `market-sheet.test.tsx:252`            | `Caro` é `insufficient-balance` (segue visível); livres invertem              | `["BaratoB","BaratoA","Caro"]`                                      |
| `market-sheet.test.tsx:255-294`        | com o novo padrão as duas ordens ficam **iguais** — o teste perde o sentido    | 3 fixtures cujas 3 ordens são permutações distintas; novo `name` do radio |
| `market-sheet.test.tsx:296-317`        | `name` do radio mudou                                                         | novo nome + `queryByRole("searchbox")` ausente                      |
| `market-summary-bar.test.tsx` (5 casos)| prop `position` removida                                                      | remoção mecânica; o caso "número da vaga" é deletado                |

**Novos, por nível:**

- **Domínio:** `market-closed` some; um caso por motivo sobrevivente; **regressão de precedência**
  (`marketOpen: false` + org travada → continua na lista com `no-round`); **guard do outgoing travado**
  (nada some); busca por acento/caixa/substring/vazio; busca não quebra "bloqueados por último"; as
  três ordens dão três permutações.
- **`market-sheet.test.tsx`:** digitar filtra ao vivo; contador só com busca ativa; contador reflete as
  quatro funções; aba com 0 matches segue **habilitada**; estado vazio de busca com "Limpar busca"; o
  par que prova a decisão 1 (travado ausente + sem-saldo presente); `getByRole("status")` com a contagem.
- **`roster-panel.test.tsx`:** trocar de vaga sem fechar o Sheet **zera a busca** (o arquivo já mocka
  `next-safe-action/hooks` e tem os handlers prontos).
- **`market-summary-bar.test.tsx`:** teto correto na substituição (10.000 + 4.000 → `140.0`); célula
  ausente na vaga vazia; rótulo "Fecha em" vs "Mercado".

## Sequência de execução

1. `lib/market/search.ts` + testes (isolado).
2. `ordering.ts` reescrito + `spendingCapCents` + `ordering.test.ts` reescrito. **O TypeScript quebra
   `market-sheet.tsx` aqui** — é o sinal de que o passo 3 é obrigatório.
3. `market-sheet.tsx`: memos, estado, reset (sem mexer no layout).
4. `market-summary-bar.tsx` + testes (independente; pode ir em paralelo).
5. `market-sheet.tsx`: layout, contadores, estados vazios, live region, alerta de outgoing travado.
6. Testes novos de componente + o de `roster-panel`.
7. Opcional: `verdict` como prop de `MarketPlayerRow` (`market-player-row.tsx:44`) para eliminar a
   última reavaliação por linha — retrocompatível, os testes do card seguem passando.

## Verificação

1. `pnpm exec vitest run lib/market components/market components/team`, depois `pnpm test` inteiro
   (`lib/vlr/persist/rounds.test.ts` já falha por conta própria, sensível à data — não é regressão).
2. `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec prettier --write .`.
3. `pnpm dev` → `/my-team` → clicar numa vaga: lista abre do **mais caro** para o mais barato; ninguém
   de organização que joga hoje aparece (confira contra "Próximos jogos" da Home); digitar um pedaço do
   nickname reduz os cards a cada tecla e os contadores das outras abas mudam junto; trocar de vaga abre
   com a busca limpa; o topo mostra Saldo, Pode gastar e o countdown andando sozinho.

## Riscos e o que fica de fora

- **Sumir jogador é irreversível para o usuário** — não há "mostrar mesmo assim". Num sábado cheio uma
  aba pode esvaziar; mitigado pela segunda mensagem de estado vazio, que não deve ser cortada.
- **A decisão 1 depende de uma ordem de `if`s** em `eligibility.ts:94-95`. Só o teste de regressão protege.
- **Churn de teste:** ~10 arquivos/casos tocados, mecânico, mas é o custo de inverter um padrão de ordem.
- **Fora de escopo:** buscar por organização ou agente (o pedido é nome do jogador; ampliar é uma linha);
  ranking por relevância; fuzzy/tolerância a erro de digitação; persistir a ordem em URL/localStorage;
  paginação/virtualização; auto-trocar de aba ao digitar; debounce; e levar o filtro para o servidor em
  `loadMarket` — tentador pelo payload, mas o cliente precisa da contagem "escondidos por trava" para a
  mensagem de estado vazio, e a trava é reavaliada no cliente de qualquer forma.
