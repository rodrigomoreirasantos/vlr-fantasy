# Monte seu time — preencher vagas vazias pelo mercado

## Context

O commit `edb7907` entregou a **substituição** de jogadores: o usuário clica em alguém já
escalado e troca por outro da mesma função. O plano daquela feature
(`.claude/plans/01-substituicao-jogadores-mercado.md`) deixou explicitamente fora de escopo
_"preencher vaga vazia — o fluxo exige um jogador saindo para definir a função e o crédito"_.

O resultado é que **um usuário novo não consegue montar time algum**. Ao criar a conta,
`ensureFantasyTeam` (`lib/team/queries.ts`) cria o time com as 5 `roster_slot` vazias, mas:

1. `app/my-team/page.tsx` só carrega o catálogo das funções **já escaladas** — com roster
   vazio, `rolesEscaladas` é `[]` e `getMarketByRole([])` devolve `{}`;
2. `EmptyPlayerRow` e o marcador vazio do `FormationBoard` não são interativos;
3. `RosterPanel.handleConfirm` faz `if (!selectedSlot?.id || !outgoing) return` e o
   `MarketSheet` inteiro é condicionado a `outgoing` não-nulo;
4. `SubstitutionContext.outgoing` é `Player` **obrigatório** em `evaluateSubstitution`
   (é ele que define a função exigida e o crédito da venda);
5. `substitutePlayerSchema.outgoingPlayerId` é `z.uuid()` obrigatório.

`prompts/02_start_your_team.md` pede: card com "+" no lugar do jogador quando a vaga está
vazia, bolinhas do campo mantidas sem informação de jogador, reaproveitar a última escalação
quando ela existe, e máximo de 5 jogadores.

**Resultado pretendido:** clicar numa vaga vazia — no "Resumo" ou no campo — abre o mesmo
`MarketSheet`, agora em modo "nova contratação" (todas as funções, custo = preço cheio), e a
contratação usa a mesma transação e a mesma regra de elegibilidade da substituição.

O banco **já suporta** tudo isso: `roster_slot.player_id` é nullable, `transfer.out_player_id`
é nullable com `out_price_cents DEFAULT 0`, e `applySubstitution` já aceita
`outgoingPlayerId: string | null`. Nenhuma migration é necessária.

### Decisões de produto (confirmadas)

| Pergunta                                     | Decisão                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Quais jogadores no mercado de uma vaga vazia | **Todas as 4 funções**, agrupadas e rotuladas por função                    |
| Bolinha vazia no campo                       | **Clicável**, abre o mesmo mercado                                          |
| Estado vazio do painel                       | Estatísticas mantidas + faixa "Monte seu time · X de 5 jogadores escalados" |

---

## Princípio norteador (herdado do plano 01)

`evaluateSubstitution` continua sendo a **fonte única de verdade**, compartilhada entre a UI
(habilita o botão "Contratar") e a Server Action (revalida dentro da transação com dados
relidos do banco). A vaga vazia entra como um **caso da mesma função**, nunca como uma regra
paralela. Nada de `canBuyIntoEmptySlot()` em outro arquivo.

---

## 1. Domínio — `lib/market/eligibility.ts`

Tornar `outgoing` anulável. É a mudança que destrava todas as outras.

```ts
export type SubstitutionContext = {
  marketOpen: boolean;
  balanceCents: number;
  /**
   * Quem deixa a vaga — define a função exigida e o crédito da venda.
   * `null` numa vaga vazia: não há função exigida nem crédito, e o custo
   * da contratação é o preço cheio do candidato.
   */
  outgoing: Player | null;
  rosteredPlayerIds: readonly string[];
};
```

Em `evaluateSubstitution`:

- `const netCostCents = incoming.priceCents - (ctx.outgoing?.priceCents ?? 0);`
- Precedência preservada; duas regras passam a ser condicionais:
  - `same-player` → só quando há `outgoing` (inalcançável sem ele);
  - `role-mismatch` → `if (ctx.outgoing && incoming.role !== ctx.outgoing.role)`.
- `already-rostered` e `insufficient-balance` valem igual (a fronteira "gastar o saldo todo é
  permitido" continua exata).

`blockReasonMessage(reason, requiredRole: PlayerRole | null)`: no caso `role-mismatch`, quando
`requiredRole` é `null`, devolver `"Só é possível substituir por outro jogador da mesma função."`
(defensivo — o motivo não é alcançável sem `outgoing`).

Atualizar o JSDoc explicando o caso da vaga vazia.

---

## 2. Constante de funções — `lib/team/types.ts`

O `MarketSheet` em modo contratação precisa iterar as 4 funções. Hoje a lista só existe como
tupla dentro do `pgEnum` em `db/schema/players.ts` — importar schema de banco num componente
cliente é indesejável.

```ts
export const PLAYER_ROLES = [
  "Duelista",
  "Iniciador",
  "Controlador",
  "Sentinela",
] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];
```

Em `db/schema/players.ts`, trocar a tupla local por `pgEnum("player_role", PLAYER_ROLES)`.
Os valores são idênticos — **não gera migration**. Se o `pgEnum` reclamar do tipo `readonly`,
manter o schema como está (com o `satisfies readonly PlayerRole[]` atual) e apenas adicionar a
constante em `types.ts`; não vale forçar um cast.

---

## 3. Catálogo do mercado — `app/my-team/page.tsx`

Carregar todas as funções quando existe pelo menos uma vaga vazia:

```tsx
const rolesEscaladas = new Set<PlayerRole>(
  roster.flatMap((slot) => (slot.player ? [slot.player.role] : [])),
);
// Uma vaga vazia não tem função exigida: o usuário escolhe entre todas.
const temVagaVazia = roster.some((slot) => !slot.player);
const market = await getMarketByRole(
  temVagaVazia ? PLAYER_ROLES : Array.from(rolesEscaladas),
);
```

`getMarketByRole` (`lib/team/queries.ts`) fica **inalterada** — já filtra `active = true` e
ordena `desc(score), asc(nickname)`.

---

## 4. Validação e Server Action

### `lib/validations/market.ts`

```ts
export const substitutePlayerSchema = z.object({
  slotId: z.uuid("Vaga inválida."),
  /** `null` quando a vaga está vazia — contratação sem ninguém saindo. */
  outgoingPlayerId: z.uuid("Jogador inválido.").nullable(),
  incomingPlayerId: z.uuid("Jogador inválido."),
});
```

### `app/my-team/actions.ts` — `substitutePlayer`

Mudanças pontuais, dentro da mesma transação e da mesma ordem de lock (time → vaga):

- A guarda de concorrência **já funciona com `null`** e continua valendo como está:
  `if (!slot || slot.playerId !== outgoingPlayerId)` — se a vaga foi preenchida por outra aba,
  `slot.playerId` deixa de ser `null` e a troca é recusada com
  _"Essa vaga mudou enquanto você decidia. Recarregue a página."_
- `loadPlayersByIds(tx, outgoingPlayerId ? [outgoingPlayerId, incomingPlayerId] : [incomingPlayerId])`
- `const outgoing = outgoingPlayerId ? rows.find((r) => r.id === outgoingPlayerId) : null;`
  Erro _"Jogador não encontrado no catálogo."_ quando `!incoming` **ou** quando
  `outgoingPlayerId && !outgoing`.
- `evaluateSubstitution({ ..., outgoing: outgoing ? toDomainPlayer(outgoing) : null }, ...)`
- `blockReasonMessage(verdict.blockedBy, outgoing?.role ?? null)`
- `applySubstitution(tx, { ..., outgoingPlayerId, outPriceCents: outgoing?.priceCents ?? 0 })`
  — a assinatura já aceita `string | null`.

### Capitão automático (adição pequena, destacável)

Um time montado do zero nunca teria capitão até o usuário clicar no "C". Dentro da mesma
transação, depois de `applySubstitution`, marcar a vaga como capitã quando o time ainda não
tem nenhuma:

- nova primitiva em `lib/team/queries.ts`:
  `hasCaptain(tx, teamId): Promise<boolean>` (um `select` em `rosterSlot` com
  `eq(fantasyTeamId)` + `eq(captain, true)`, `limit(1)`);
- na action: `if (!outgoingPlayerId && !(await hasCaptain(tx, team.id))) await setTeamCaptain(tx, team.id, slotId);`

`setTeamCaptain` já existe (no diff não commitado) e respeita
`roster_slot_single_captain_uidx`. **Se preferir não incluir**, é só remover esse bloco — nada
mais depende dele.

---

## 5. UI

### 5.1 `components/team/player-row.tsx` — o card com "+"

`EmptyPlayerRow` ganha `onSelect?: () => void` e `selected?: boolean`. Sem `onSelect` (mercado
fechado) continua o `<li>` inerte de hoje. Com `onSelect`, o conteúdo vira um `<button>`
ocupando a linha:

- ícone `Plus` (lucide) num quadrado `size-[46px]`, no lugar do retrato;
- texto **"Adicionar jogador"** + `Vaga {position}` em `text-muted-foreground`;
- `aria-label={\`Adicionar jogador na vaga ${position}\`}`, `aria-haspopup="dialog"`,
`aria-expanded={selected}`— mesmo contrato acessível do`PlayerRow`;
- estilo: reaproveitar o `clip-corner ... [--clip:10px]` + `border border-dashed border-border`
  já usados, com `hover:border-primary hover:text-primary` e `selected && "border-primary"`.
  Só tokens de tema (`--primary`, `--border`, `--muted-foreground`), nunca cor Tailwind crua.

### 5.2 `components/team/formation-board.tsx` — bolinha clicável

No `Marker`, o `<button>` deixa de exigir `player`: passa a ser renderizado sempre que houver
`onSelect` (e a vaga for selecionável). Dois `aria-label` distintos:

- com jogador: `Substituir ${player.nickname} no campo` (inalterado);
- vazia: `Adicionar jogador na vaga ${index + 1}`.

O círculo vazio mantém `border border-dashed border-border` (é o requisito "as bolinhas
permanecem sem informações") e recebe um `Plus` centralizado em `text-border`, com
`hover:border-primary` e `selected && "border-primary"`. O label abaixo continua `Slot {n}`.

### 5.3 `components/market/market-sheet.tsx` — modo "nova contratação"

Trocar as props `outgoing: Player | null` por uma seleção explícita, para o Sheet saber a
diferença entre "nada selecionado" e "vaga vazia selecionada":

```ts
export type MarketSelection = { position: number; outgoing: Player | null };
// props: selection: MarketSelection | null  (substitui `outgoing`)
```

- O corpo passa a ser condicionado a `selection`, não a `outgoing`.
- `ctx` (`SubstitutionContext`) monta com `outgoing: selection.outgoing`.
- Candidatos viram **grupos por função**, reaproveitando a ordenação atual
  (não-bloqueados primeiro; `sort` estável preserva a ordem por pontuação):
  - com `outgoing`: um grupo só, `market[outgoing.role]`, **sem** cabeçalho (comportamento de
    hoje preservado);
  - sem `outgoing`: os 4 grupos de `PLAYER_ROLES`, cada um com um cabeçalho
    (`text-[10px] uppercase tracking-wider text-muted-foreground`, no padrão do `Panel`),
    grupos vazios omitidos.
- Título/descrição:
  - substituição: `Mercado · {role}` / "Substituindo {nickname}. Só aparecem jogadores da mesma função."
  - contratação: `Mercado · Nova contratação` / "Escolha um jogador para a vaga {position}."
- Estado vazio: `Nenhum jogador disponível no mercado.` quando não há `outgoing`.
- `ScrollArea` com `min-h-0 flex-1` e o `pending && "pointer-events-none opacity-70"` ficam como estão.

### 5.4 `components/market/market-summary-bar.tsx`

`outgoing: Player | null` + `position: number`. Na coluna do meio: com `outgoing`, label "Sai"
e o nickname (hoje); sem, label **"Vaga"** e o número da vaga. Saldo e janela inalterados.

### 5.5 `components/market/market-player-row.tsx`

Única mudança: `blockReasonMessage(verdict.blockedBy!, ctx.outgoing?.role ?? null)`.
O resto (retrato, `aria-disabled`, `aria-describedby`, `formatCreditsDelta`) já funciona — com
`outgoing: null` o `netCostCents` é o preço cheio e o texto "−148.0 · saldo 52.0" sai correto.

### 5.6 `components/team/roster-panel.tsx` — a ilha cliente

- `handleSelect(index)`: manter `if (!marketOpen) return` e exigir `roster[index]?.id`; deixa de
  exigir `slot.player`.
- `selection` derivada: `selectedIndex !== null && selectedSlot?.id ? { position: selectedIndex + 1, outgoing: selectedSlot.player } : null`.
- `handleConfirm`: `if (!selectedSlot?.id) return;` e
  `execute({ slotId: selectedSlot.id, outgoingPlayerId: outgoing?.id ?? null, incomingPlayerId: candidate.id })`.
- Toast de sucesso conforme o modo: **"Contratação concluída!"** sem `outgoing`,
  "Substituição concluída!" com. (Guardar o modo num `useRef`/derivar de `selectedSlot` antes do
  `setSelectedIndex(null)` — o `onSuccess` roda depois do estado mudar.) Alternativa mais
  simples e aceitável: usar a mensagem neutra **"Time atualizado!"** nos dois casos.
- `EmptyPlayerRow` passa a receber `onSelect` e `selected` quando `marketOpen && slot.id`.
- **Faixa de progresso** (decisão de produto): quando `escalados < 5`, renderizar acima do grid
  um bloco `clip-corner ring-1 ring-primary/40 bg-primary/10 [--clip:10px]` com
  `Monte seu time · {escalados} de 5 jogadores escalados` e, quando `escalados === 0`, a
  segunda linha "Clique em uma vaga para contratar seu primeiro jogador.".
  Extrair como `components/team/lineup-progress.tsx` (`{ filled: number; total: number }`) para
  não inchar o `RosterPanel` e permitir teste isolado.

O limite de **5 jogadores** não precisa de código novo: as 5 vagas fixas
(`CHECK position BETWEEN 1 AND 5`, `roster_slot_team_position_uidx`, `ROSTER_SIZE`,
`toRosterSlots` sempre devolvendo 5) e o bloqueio `already-rostered` já o garantem. A faixa
apenas o comunica.

---

## Arquivos tocados

| Arquivo                                    | Mudança                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `lib/market/eligibility.ts`                | `outgoing` anulável; `role-mismatch`/`same-player` condicionais; `blockReasonMessage` aceita `role \| null` |
| `lib/team/types.ts`                        | `PLAYER_ROLES` exportado; `PlayerRole` derivado dele                                                        |
| `db/schema/players.ts`                     | `pgEnum` usa `PLAYER_ROLES` (sem migration)                                                                 |
| `lib/validations/market.ts`                | `outgoingPlayerId` `.nullable()`                                                                            |
| `lib/team/queries.ts`                      | + `hasCaptain(tx, teamId)`                                                                                  |
| `app/my-team/actions.ts`                   | `substitutePlayer` aceita saída nula; capitão automático                                                    |
| `app/my-team/page.tsx`                     | carrega todas as funções quando há vaga vazia                                                               |
| `components/team/player-row.tsx`           | `EmptyPlayerRow` interativo com "+"                                                                         |
| `components/team/formation-board.tsx`      | bolinha vazia clicável com "+"                                                                              |
| `components/team/roster-panel.tsx`         | seleção de vaga vazia, `outgoingPlayerId: null`, faixa de progresso                                         |
| `components/team/lineup-progress.tsx`      | **novo** — contador "X de 5"                                                                                |
| `components/market/market-sheet.tsx`       | `selection`; grupos por função no modo contratação                                                          |
| `components/market/market-summary-bar.tsx` | `outgoing` anulável + `position`                                                                            |
| `components/market/market-player-row.tsx`  | `ctx.outgoing?.role ?? null`                                                                                |

Nada de novo em `db/schema` além do enum, **nenhuma migration**, nenhum componente shadcn novo
(`Sheet`, `Button`, `Badge`, `ScrollArea`, `Alert` já instalados).

---

## Ordem de execução

1. `lib/team/types.ts` (`PLAYER_ROLES`) + `db/schema/players.ts`
2. `lib/market/eligibility.ts` + testes de domínio
3. `lib/validations/market.ts` → `app/my-team/actions.ts` (+ `hasCaptain`) + testes da action
4. `app/my-team/page.tsx` (catálogo completo)
5. `components/market/*` (`market-summary-bar` → `market-player-row` → `market-sheet`) + testes
6. `components/team/player-row.tsx` e `formation-board.tsx` + testes
7. `components/team/lineup-progress.tsx` + `roster-panel.tsx` + testes
8. `pnpm test` → `pnpm lint` → `pnpm exec prettier --write .` → `pnpm build`

---

## Verificação

### Testes (Vitest 4 + RTL, `pnpm test`) — usar a skill `react-testing-library`

Seguir os padrões já existentes: `vi.hoisted()` + `vi.mock("@/db", ...)` com `txStub` para a
action (`app/my-team/actions.test.ts`), tokens `Symbol` para discriminar qual action o
`useAction` mockado recebe (`components/team/roster-panel.test.tsx`), queries sempre por
role/label acessível. Banco **sempre** mockado.

**Testes que quebram e precisam ser reescritos:**

- `components/team/formation-board.test.tsx` → `"com onSelect, uma vaga vazia continua sem botão"`
  agora é o oposto: a vaga vazia **é** botão.
- `components/team/player-row.test.tsx` → describe `EmptyPlayerRow` espera os textos `"3"` e
  `"Slot vazio"`.

**Testes novos:**

- `lib/market/eligibility.test.ts`: com `outgoing: null` — `netCostCents` é o preço cheio;
  candidato de qualquer função é liberado (sem `role-mismatch`); `already-rostered` ainda
  bloqueia; fronteira exata de saldo (`preço === saldo` passa, `preço === saldo + 1` bloqueia).
- `app/my-team/actions.test.ts`: `outgoingPlayerId: null` numa vaga vazia chama
  `applySubstitution` com `outgoingPlayerId: null` e `outPriceCents: 0`; vaga já preenchida
  recusa com "Essa vaga mudou enquanto você decidia."; mercado fechado bloqueia; capitão
  automático só quando `hasCaptain` é `false`.
- `components/market/market-sheet.test.tsx`: sem `outgoing`, título "Nova contratação",
  candidatos das 4 funções com cabeçalho de grupo; com `outgoing`, comportamento de hoje
  preservado (uma função, sem cabeçalho).
- `components/team/player-row.test.tsx` / `formation-board.test.tsx`: vaga vazia com `onSelect`
  expõe botão `Adicionar jogador na vaga N`; sem `onSelect`, nenhum botão.
- `components/team/roster-panel.test.tsx`: clicar na vaga vazia (lista **e** campo) abre o Sheet
  em modo contratação; "Contratar" chama `execute` com `outgoingPlayerId: null`; faixa mostra
  "0 de 5" com roster vazio e some com 5 escalados; mercado fechado deixa a vaga vazia inerte.

### Manual (`pnpm dev`)

O seed (`db/seed.ts`) preenche as 5 vagas de **todo time que estiver vazio**, então para ver o
estado inicial: rode o seed **antes** e crie uma conta nova em `/signup` — o hook
`databaseHooks.user.create.after` cria o time com as 5 vagas vazias e ele não é tocado pelo seed.

Roteiro em `/my-team`:

1. Time vazio → 5 cards "+" no Resumo, 5 bolinhas tracejadas no campo, faixa "0 de 5".
2. Clicar num card "+" → Sheet "Nova contratação" com as 4 funções agrupadas; contratar →
   toast, saldo cai pelo preço cheio, a vaga se preenche na lista **e** no campo, faixa vai a "1 de 5".
3. Repetir até 5 → faixa some; jogadores já escalados aparecem bloqueados com "Já escalado".
4. Clicar num jogador escalado → o fluxo de substituição de hoje segue idêntico (só a mesma função).
5. Recarregar → a escalação persiste (requisito "usar a última escalação feita").
6. Com a rodada fora da janela (`market_opens_at`/`market_closes_at` no passado) → vagas vazias
   voltam a ser inertes e o Sheet não abre.
