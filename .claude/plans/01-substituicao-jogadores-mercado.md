# Substituição de jogadores pelo mercado de transferências

## Context

`prompts/01_choose_player_team.md` pede que o usuário troque jogadores do seu time
usando o mercado, sob quatro regras de produto:

1. Substituir só é possível **enquanto a janela de mercado estiver aberta**.
2. Ao **selecionar um jogador do seu time**, ele vê o mercado e descobre se tem dinheiro
   para contratar cada candidato.
3. Quem ele **não pode pagar aparece mesmo assim**, com a compra desabilitada e o motivo visível.
4. **Só se troca por alguém da mesma função** — sai um Controlador, entra um Controlador.

Hoje `/my-team` é uma tela **somente leitura alimentada por mock**: `app/my-team/page.tsx`
chama `placeholderRoster()`/`placeholderSummary()` de `lib/team/placeholder.ts`, cujo próprio
cabeçalho já instrui "crie o schema (players/roster/rounds), troque as duas funções por queries
Drizzle e apague este arquivo". O banco só tem as tabelas do Better Auth. Não existe preço de
jogador, saldo persistido, janela de mercado nem qualquer Server Action no repositório.

Resultado pretendido: `/my-team` passa a ler do Postgres e ganha um painel de mercado sobreposto
que executa a substituição de forma transacional e revalidada no servidor.

### Princípio norteador

**Uma única fonte de verdade para a regra**: `evaluateSubstitution()` em `lib/market/eligibility.ts`.
A UI a usa para decidir se o botão "Contratar" está ativo e qual motivo mostrar; a Server Action
chama **a mesma função**, dentro da transação, com dados relidos do banco. A regra nunca é
reescrita nos dois lados.

### Decisões tomadas

| Tema | Decisão |
| --- | --- |
| Design | Seguir a linguagem visual já implementada em `/my-team` (o link do Claude Design retorna 403 para mim) |
| Dados | Banco real com Drizzle, substituindo o placeholder |
| Fluxo | `Sheet` sobreposto, aberto ao clicar num jogador do time — sem sair de `/my-team` |
| Poder de compra | `saldo + preço de quem sai` (venda pelo preço cheio financia a compra) |
| Janela | Tabela `round` com `market_opens_at` / `market_closes_at`; countdown com dayjs |
| Preço | Coluna persistida no catálogo (`player.price_cents`) |
| Capitão | A braçadeira pertence à **vaga**: quem entra herda o "C" |
| Vaga vazia | Fora de escopo — `EmptyPlayerRow` segue não interativo |

---

## 1. Dependências

```bash
pnpm add next-safe-action dayjs
pnpm dlx shadcn@latest add sheet badge scroll-area alert
```

`next-safe-action` e `dayjs` são exigidos pelo CLAUDE.md e **não estão instalados**.
`next-safe-action@8.6.1` declara peers `next >= 14` / `react >= 18.2` — compatível com
Next 16.3.1 e React 19.2.8. API atual: `.inputSchema(...)` + `.action(...)`, middleware via
`.use(({ next }) => next({ ctx }))` (confirmado no Context7). `components.json` está em
`style: "radix-nova"` → base Radix → usar `asChild` em triggers customizados.

Já verifiquei contra o que está instalado: `numeric({ mode: "number" })` e `.for("update")`
existem no drizzle-orm 0.45.2; `z.uuid()` existe no zod 4.4.3; `revalidatePath` continua válido
em Server Functions no Next 16 e `next.config.ts` está no default (sem `cacheComponents`).

---

## 2. Schema Drizzle

Um arquivo por domínio em `db/schema/`, reexportados por `db/schema/index.ts` (hoje só
`export * from "./auth"`).

### Tipos numéricos — a decisão mais importante

| Grandeza | Tipo | Coluna | Porquê |
| --- | --- | --- | --- |
| Dinheiro | `integer` em **centavos** | `price_cents`, `balance_cents` | Aritmética exata em SQL, permite `CHECK (balance_cents >= 0)`, sem drift de float no caminho crítico da transação |
| Pontuação | `numeric(6,1, { mode: "number" })` | `score` | Mantém `Player.score: number`; sem `mode` o Drizzle devolveria `string` |
| Datas | `timestamp({ withTimezone: true, mode: "date" })` | janela de mercado | Instante absoluto; dayjs entra só na fronteira de apresentação |

Regra a documentar em comentário: **`score` nunca entra em conta de dinheiro**. O sufixo
`Cents` marca tudo que é moeda.

### `db/schema/players.ts`

```ts
import type { PlayerRole } from "@/lib/team/types";

// Import unidirecional: o schema conhece o tipo de domínio, nunca o contrário.
export const PLAYER_ROLES = [
  "Duelista", "Iniciador", "Controlador", "Sentinela",
] as const satisfies readonly PlayerRole[];

export const playerRole = pgEnum("player_role", PLAYER_ROLES);
```

Tabela `player`: `id` uuid PK · `nickname` text NOT NULL · `team` text NOT NULL (organização
real, ex. "FNATIC") · `agent` text NOT NULL · `role` `playerRole` NOT NULL · `price_cents`
integer NOT NULL · `score` numeric(6,1) NOT NULL default 0 · `active` boolean NOT NULL default
true · timestamps.
Índices: `player_nickname_uidx`; `player_role_active_idx` em `(role, active)` — é a query exata
do mercado. `CHECK (price_cents > 0)`.

O `satisfies readonly PlayerRole[]` faz a compilação falhar se os labels do enum divergirem do
tipo de domínio, sem redeclarar nada.

### `db/schema/rounds.ts`

`roundStatus` = `pgEnum("round_status", ["upcoming","active","finished"])`.
Tabela `round`: `id` · `number` integer NOT NULL · `name` text · `market_opens_at` /
`market_closes_at` timestamptz NOT NULL · `total_matches` / `scored_matches` integer default 0 ·
`status` default `"upcoming"` · timestamps.
Índices: `round_number_uidx`; **índice único parcial** `round_single_active_uidx` on `status`
`WHERE status = 'active'` (no máximo uma rodada ativa).
`CHECK (market_closes_at > market_opens_at)` e `CHECK (scored_matches BETWEEN 0 AND total_matches)`.

`scored_matches`/`total_matches` alimentam o card "Partidas Pontuadas" que `TeamStats` já renderiza.

### `db/schema/fantasy-teams.ts`

Nome `fantasy_team`, **não** `team` — "team" já significa a organização real em `player.team`;
evitar a colisão semântica desde já.

`id` uuid PK · `user_id` **text** NOT NULL FK→`user.id` cascade (text para casar com o id do
Better Auth) · `name` text NOT NULL · `balance_cents` integer NOT NULL default
`INITIAL_BALANCE_CENTS = 20_000` (200.0 créditos — chute de balanceamento, fácil de ajustar) ·
timestamps.
`uniqueIndex("fantasy_team_user_uidx").on(userId)` — um time por usuário, e serve de índice da FK.
`CHECK (balance_cents >= 0)`.

### `db/schema/roster.ts`

`roster_slot`: `id` · `fantasy_team_id` FK cascade · `position` integer (1–5) · `player_id` uuid
**nullable** FK→`player.id` `onDelete: "restrict"` (null = vaga vazia) · `captain` boolean default
false · timestamps.

Índices:
- `roster_slot_team_position_uidx` on `(fantasy_team_id, position)` — cinco vagas fixas.
- `roster_slot_team_player_uidx` on `(fantasy_team_id, player_id)` — o mesmo jogador não se repete
  no time. `NULLS DISTINCT` (padrão do Postgres) deixa várias vagas vazias conviverem. **É a rede
  de segurança contra duas abas comprando o mesmo jogador.**
- `roster_slot_single_captain_uidx` on `fantasy_team_id` `WHERE captain`.
- `roster_slot_player_idx` on `player_id`.
- `CHECK (position BETWEEN 1 AND 5)`.

Não há `role` na vaga: a função exigida vem do **jogador que sai**, não da vaga — o roster de
referência tem dois Duelistas.

### `db/schema/transfers.ts`

`transfer`: `id` · `fantasy_team_id` FK cascade · `round_id` FK restrict · `roster_slot_id` FK
cascade · `out_player_id` uuid nullable FK restrict · `in_player_id` uuid NOT NULL FK restrict ·
`out_price_cents` integer default 0 · `in_price_cents` integer NOT NULL · `balance_after_cents`
integer NOT NULL · `created_at`.
Índices em `(fantasy_team_id, round_id)` e `(fantasy_team_id, created_at)`.

Preços são **snapshot**: o histórico não se distorce quando o catálogo reprecificar. Existir esta
tabela é o que torna auditável qualquer divergência de saldo.

### `db/schema/relations.ts`

Todas as `relations()` das tabelas novas num arquivo só, para não criar ciclo de import entre
`players.ts` ↔ `roster.ts` ↔ `fantasy-teams.ts`. Segue o estilo de `db/schema/auth.ts`.

---

## 3. Camada de domínio pura — `lib/market/`

Sem Drizzle e sem React, como manda o CLAUDE.md. É o que os testes mais baratos cobrem.

### `lib/market/money.ts`

```ts
export const CENTS_PER_CREDIT = 100;
export function creditsToCents(credits: number): number;   // Math.round
export function centsToCredits(cents: number): number;
/** Moeda sempre com uma casa: 14820 → "148.2". */
export function formatCredits(cents: number): string;
/** Variação com sinal: "+12.5" / "−12.5". */
export function formatCreditsDelta(cents: number): string;
```

`components/team/team-stats.tsx` passa a usar `formatCredits(balanceCents)` no lugar de
`balance.toFixed(1)` — a formatação de moeda deixa de estar solta em JSX.

### `lib/market/eligibility.ts`

```ts
export type BlockReason =
  | "market-closed" | "player-inactive" | "same-player"
  | "already-rostered" | "role-mismatch" | "insufficient-balance";

export type SubstitutionContext = {
  marketOpen: boolean;
  balanceCents: number;
  /** Quem deixa a vaga — define a função exigida e o crédito da venda. */
  outgoing: Player;
  rosteredPlayerIds: readonly string[];
};

export type Verdict = {
  netCostCents: number;        // incoming.priceCents - outgoing.priceCents (pode ser negativo)
  balanceAfterCents: number;
  blockedBy: BlockReason | null;
};

export function evaluateSubstitution(ctx: SubstitutionContext, incoming: Player): Verdict;
export function canSubstitute(ctx: SubstitutionContext, incoming: Player): boolean;
export function blockReasonMessage(reason: BlockReason, requiredRole: PlayerRole): string;
export function blockReasonLabel(reason: BlockReason): string;  // rótulo curto do Badge
```

**Precedência fixa** (a primeira que casar vence): `market-closed` → `player-inactive` →
`same-player` → `already-rostered` → `role-mismatch` → `insufficient-balance`. Assim o usuário
nunca vê "sem saldo" quando o problema real é a função.

| Reason | Label | Mensagem |
| --- | --- | --- |
| `market-closed` | Mercado fechado | "A janela de mercado está fechada." |
| `player-inactive` | Indisponível | "Este jogador não está disponível nesta rodada." |
| `same-player` | Já é seu | "Este jogador já ocupa essa vaga." |
| `already-rostered` | Já escalado | "Este jogador já está no seu time." |
| `role-mismatch` | Outra função | `Só é possível substituir por outro ${requiredRole}.` |
| `insufficient-balance` | Sem saldo | "Saldo insuficiente para esta contratação." |

Fronteira exata: `netCostCents <= balanceCents` é **permitido** (gastar tudo é válido). Caso de
teste obrigatório.

### `lib/market/window.ts`

```ts
export function isMarketOpen(w: { opensAt: Date; closesAt: Date }, now?: Date): boolean;
export function formatTimeLeft(closesAt: Date, now?: Date): string;  // "36h 12m" | "12m" | "Encerrado"
export function formatClosesAt(closesAt: Date): string;              // "Fecha sáb, 14/03 às 18:00"
```

`now` injetável → testes determinísticos sem fake timers. **Todo `dayjs` do projeto vive aqui**;
nenhum componente o importa direto. Resolve o TODO em `lib/team/types.ts:38-41`.

---

## 4. Camada de dados

### `lib/team/types.ts` — alterações

- `Player` ganha `priceCents: number`. Preferi isso a um `MarketPlayer = Player & {...}`: todo
  jogador do jogo tem preço, e um tipo só evita duas variantes atravessando `PlayerRow`.
- `TeamSummary.balance: number` → `balanceCents: number`.
- `TeamSummary.market` ganha `closesAt: Date | null`; `closesIn` passa a vir de `formatTimeLeft`.

Custo: acrescentar `priceCents` aos fixtures de `player-row.test.tsx` e `formation-board.test.tsx`
— quebra de **compilação**, nenhuma asserção muda. Corrigir no passo 7, antes de tocar em UI.

### `lib/team/queries.ts` (novo)

```ts
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Aceita o client ou uma transação — sem `any`. */
export type Querier = Database | Transaction;

export async function getActiveRound(q?: Querier);
export async function getTeamOverview(userId: string): Promise<TeamOverview | null>;
export async function getMarketByRole(roles: readonly PlayerRole[]): Promise<Record<PlayerRole, Player[]>>;

// primitivas usadas dentro da transação (recebem `tx` explícito)
export async function lockTeamForUpdate(tx: Querier, userId: string);
export async function lockSlotForUpdate(tx: Querier, teamId: string, slotId: string);
export async function loadPlayersByIds(tx: Querier, ids: readonly string[]);
export async function loadRosteredPlayerIds(tx: Querier, teamId: string): Promise<string[]>;
export async function applySubstitution(tx: Querier, args: {...}): Promise<void>;
```

- `getTeamOverview` usa a API relacional (`db.query.fantasyTeam.findFirst({ with: { slots: { with: { player: true } } } })`)
  e devolve sempre 5 slots ordenados por `position`, mantendo `RosterSlot[]`/`TeamSummary` — assim
  **nenhum componente de apresentação muda por causa do banco**.
- ⚠️ **`.for("update")` não existe na API relacional `db.query.*`.** As primitivas de lock usam
  obrigatoriamente o builder core `tx.select().from(...).for("update")`. Escrevê-las com
  `findFirst` faz a corrida de saldo voltar silenciosamente.
- `getMarketByRole` faz **uma** query com `inArray(player.role, roles)` + `eq(player.active, true)`,
  ordenada por `desc(score), asc(nickname)`, e agrupa em JS. **Não** exclui quem já está escalado:
  esses aparecem bloqueados com motivo — mais informativo, e a regra já existe em
  `evaluateSubstitution`.

### `lib/team/mappers.ts` (novo)

`toDomainPlayer(row)`, `toRosterSlots(rows)` (completa até 5 vagas), `toTeamSummary(team, round, points)`.
Tipos de linha via `$inferSelect`, nunca redeclarados.

### `lib/team/placeholder.ts`

**Apagar.** Só `app/my-team/page.tsx` importa dele, como o próprio arquivo documenta.

### Criação do time

`databaseHooks.user.create.after` em `lib/auth.ts`: numa `db.transaction`, insere o `fantasy_team`
(nome derivado do nome do usuário) + as 5 `roster_slot` vazias. Para os usuários já existentes,
`getTeamOverview` devolve `null` e a página renderiza um estado vazio; uma `ensureFantasyTeam(userId)`
idempotente (`onConflictDoNothing`) chamada da página serve de fallback.

---

## 5. Server Action

### `lib/safe-action.ts`

```ts
export class ActionError extends Error {}          // mensagem segura para o usuário final

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (e instanceof ActionError) return e.message;
    console.error("Erro na Server Action:", e);
    return "Não foi possível concluir a operação. Tente novamente.";
  },
});

export const authActionClient = actionClient.use(async ({ next }) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ActionError("Sua sessão expirou. Entre novamente.");
  return next({ ctx: { userId: session.user.id } });
});
```

Mesmo espírito de `lib/auth-errors.ts`: erro real nunca vaza para a tela.

### `lib/validations/market.ts`

```ts
export const substitutePlayerSchema = z.object({
  slotId: z.uuid("Vaga inválida."),
  outgoingPlayerId: z.uuid("Jogador de saída inválido."),
  incomingPlayerId: z.uuid("Jogador de entrada inválido."),
});
```

Zod v4 top-level `z.uuid()` — nunca `z.string().uuid()`.

### `app/my-team/actions.ts` (`"use server"`)

Tudo dentro de uma `db.transaction`:

1. **Trava o time** com `SELECT … FOR UPDATE`. Ordem de lock sempre **time → vaga** (anti-deadlock).
2. Carrega a rodada ativa e calcula `isMarketOpen` **agora, no servidor** — não confia no cliente.
3. **Trava a vaga** e confere `slot.playerId === outgoingPlayerId`; se mudou, erro amigável
   ("Essa vaga mudou enquanto você decidia. Recarregue a página.").
4. **Relê os dois jogadores do banco** — preço e função vêm da fonte, não do formulário.
5. Chama **`evaluateSubstitution`**, a mesma função da UI. `blockedBy` → `ActionError(blockReasonMessage(...))`.
6. `applySubstitution`: atualiza `player_id` da vaga (o `captain` da vaga fica como está — quem entra
   herda o "C"), grava `balance_cents = verdict.balanceAfterCents` e insere a linha em `transfer`.
7. **Depois do commit**: `revalidatePath("/my-team")`.

Revalidações server-side cobertas: janela aberta (2) · vaga pertence ao usuário (3) · jogador de
saída confere (3) · mesma função, saldo, já escalado, jogador ativo (5).

**Concorrência**: o `FOR UPDATE` no `fantasy_team` serializa toda alteração de saldo do mesmo
usuário — duas abas viram fila e a segunda relê o saldo já debitado. Ordem de lock fixa evita
deadlock; a transação é curta (só banco, zero I/O externo, `revalidatePath` fora). O isolamento é o
`READ COMMITTED` padrão: o que garante a correção é o `FOR UPDATE` **seguido da releitura dentro da
transação**, nunca um saldo lido antes do `BEGIN`. `CHECK (balance_cents >= 0)` e
`roster_slot_team_player_uidx` são as defesas independentes no banco.

---

## 6. UI

```
app/my-team/page.tsx                      Server — auth, queries, header, stats
├─ components/team/panel.tsx              (extraído do page.tsx)
├─ components/team/roster-panel.tsx       "use client" — dono do estado de seleção
│   ├─ components/team/player-row.tsx     (+ onSelect/selected)
│   ├─ components/team/formation-board.tsx(+ onSelect/selectedIndex)
│   └─ components/market/market-sheet.tsx "use client"
│        ├─ components/market/market-summary-bar.tsx
│        └─ components/market/market-player-row.tsx
├─ components/team/player-price.tsx       chip de preço (formatCredits)
└─ components/team/team-stats.tsx         Server (passa a usar formatCredits)
```

**Fronteira server/client**: `page.tsx` continua Server Component — `getSession`,
`getTeamOverview(userId)` e `getMarketByRole(rolesDoRoster)` em `Promise.all` — e renderiza **uma
ilha cliente única** (`RosterPanel`) contendo os dois Panels. `header`, `TeamStats` e os dois
`ScorerHighlight` seguem server-rendered.

**O mercado vem carregado com a página**, não sob demanda: o roster tem no máximo 4 funções e o
catálogo é de dezenas/centenas de jogadores, então uma query `inArray` resolve, o Sheet abre
instantâneo e não há action de leitura nem spinner. Anotar no JSDoc de `getMarketByRole` que acima
de alguns milhares isso vira leitura paginada.

### `PlayerRow` selecionável sem quebrar os testes atuais

Extrair o miolo atual (retrato + nickname + org + `agent · role` + `PlayerScore`) para um
`PlayerIdentity` exportado. O `<li>` permanece idêntico. Dentro dele:

- **sem `onSelect`** → `<div className="flex w-full items-center gap-2.5">`
- **com `onSelect`** → `<button type="button" aria-haspopup="dialog" aria-expanded={selected} aria-label={`Substituir ${nickname}`}>`

Os 5 testes existentes renderizam sem `onSelect`, então nenhum `button` aparece e os textos e o
`getByLabelText("Capitão")` ficam no mesmo lugar — só há um wrapper a mais. Nada de `"use client"`
no arquivo: sem hooks, ele vira client ao ser importado pelo `RosterPanel`.

`FormationBoard` recebe `onSelect?: (index: number) => void` e `selectedIndex`. O círculo do
`Marker` vira `<button>` só quando há `onSelect` e jogador, com `aria-label={`Substituir ${nickname}
no campo`}` — rótulo **deliberadamente diferente** do da linha, para `getByRole("button", { name: /substituir tenz/i })`
não casar com dois elementos. Linha e marcador compartilham `selectedSlotIndex`: clicar em qualquer
um destaca ambos e abre o mesmo Sheet.

### `MarketSheet`

`SheetTitle` "Mercado · {role}" (obrigatório para a11y) e `SheetDescription` "Substituindo
{nickname}. Só aparecem jogadores da mesma função." Barra de resumo com saldo, janela e quem sai.
O `SubstitutionContext` é montado uma vez com `useMemo`; cada linha chama `evaluateSubstitution`.

### Os quatro estados, de forma acessível

| Estado | Tratamento |
| --- | --- |
| **Comprável** | `<Button size="sm">` habilitado, `aria-label={`Contratar ${nickname} por ${formatCredits(price)}`}`; ao lado, custo líquido (`formatCreditsDelta`) e saldo resultante |
| **Sem saldo** | `opacity-60`, `<Badge>Sem saldo</Badge>`, motivo em **texto visível** abaixo do preço, e botão com `aria-disabled="true"` + `onClick` guardado — **não** `disabled`. Botão `disabled` sai da ordem de foco e o motivo nunca é anunciado; com `aria-disabled` + `aria-describedby` apontando para o texto, o leitor de tela ouve o porquê |
| **Função errada** | Não deveria ocorrer (a lista já vem filtrada no servidor), mas a regra é rede de segurança: badge "Outra função" e a mensagem correspondente |
| **Mercado fechado** | `<Alert>` no topo do Sheet, todas as linhas bloqueadas, e no `RosterPanel` as linhas **não recebem `onSelect`** (voltam a ser `<li>` inertes) com subtítulo "Mercado fechado — substituições reabrem em…". Zero botão-fantasma |

Sem candidatos: estado vazio no tom de `ScorerHighlight` ("Nenhum {role} disponível no mercado.").
Resultado: `toast.success`/`toast.error` do sonner (o `<Toaster>` já está em `app/layout.tsx`);
o Sheet fecha no sucesso e o `revalidatePath` atualiza saldo, escalação e destaques.

### Estilo

Só tokens de `app/globals.css` — `bg-card`, `bg-secondary`, `text-muted-foreground`, `text-info`
(saldo/preço), `text-primary` (bloqueio), `text-success`, `ring-border` — e `clip-corner`
(`[--clip:10px]` nas linhas, `[--clip:16px]` nos painéis), igual ao que já existe.
**Zero cor hard-coded do Tailwind.**

---

## 7. Testes

| Arquivo | Cobre |
| --- | --- |
| `lib/market/money.test.ts` | `formatCredits` sempre 1 casa; ida e volta centavos↔créditos; `formatCreditsDelta` com sinal |
| `lib/market/eligibility.test.ts` | Precedência dos `BlockReason` (fechado vence função, função vence saldo); **fronteira exata de saldo** (`netCost === balance` libera, `+1` bloqueia); crédito da venda reduz o custo líquido; troca por mais barato sobra saldo; `already-rostered`; `same-player` |
| `lib/market/window.test.ts` | `isMarketOpen` nas bordas com `now` injetado; `formatTimeLeft` → "36h 12m", "12m", "Encerrado" |
| `components/team/player-row.test.tsx` | **Casos existentes intocados** + sem `onSelect` não há `role="button"`; com `onSelect` o clique dispara e `aria-expanded` reflete `selected` |
| `components/team/formation-board.test.tsx` | Existentes + marcador vira botão "Substituir TenZ no campo" só com `onSelect` |
| `components/market/market-player-row.test.tsx` | Comprável → clique chama `onConfirm`; **caro → aparece, com motivo legível, `aria-disabled` e clique que NÃO chama `onConfirm`**; preço com 1 casa |
| `components/market/market-sheet.test.tsx` | Só lista a mesma função; título/descrição corretos; estado vazio; mercado fechado → alerta e nada acionável |
| `components/team/roster-panel.test.tsx` | Clicar na linha e no marcador abrem o mesmo Sheet, com o jogador certo; mercado fechado → linhas não são botões |
| `app/my-team/actions.test.ts` | Sem sessão; mercado fechado; vaga de outro usuário; função diferente; saldo insuficiente; sucesso → `applySubstitution` recebe `balanceAfterCents` correto e `revalidatePath("/my-team")` é chamado |

### Mock do `db` — o padrão

Montar cadeias `select().from().where().for("update")` à mão é frágil. Por isso as leituras da
transação ficam isoladas em funções nomeadas em `lib/team/queries.ts`: o teste mocka **esse
módulo**, e do `@/db` só a `transaction`.

```ts
// vi.hoisted: as fábricas precisam existir antes dos vi.mock içados.
const { transactionMock, txStub } = vi.hoisted(() => {
  const txStub = Symbol("tx");
  const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txStub));
  return { transactionMock, txStub };
});
vi.mock("@/db", () => ({ db: { transaction: transactionMock } }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: getSessionMock } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/team/queries", () => ({ lockTeamForUpdate: vi.fn(), /* … */ }));
```

Cada teste arranja os retornos com `vi.mocked(...)`, chama a action e afirma sobre
`result.serverError` / `result.data` e sobre `vi.mocked(applySubstitution).mock.calls[0]`.
Banco zero, container zero, `pg-mem` zero — como manda o CLAUDE.md. Será o primeiro mock de `db`
do repo; o padrão de `vi.mock` no topo já existe em `components/auth/sign-in-form.test.tsx`.

Provável ajuste em `vitest.setup.ts` para o Radix Sheet no jsdom: stubs de
`Element.prototype.hasPointerCapture`, `scrollIntoView` e `ResizeObserver`. Confirmar ao rodar o
primeiro teste do Sheet.

---

## 8. Ordem de execução

1. `pnpm add next-safe-action dayjs`
2. `pnpm dlx shadcn@latest add sheet badge scroll-area alert`
3. Escrever `db/schema/{players,rounds,fantasy-teams,roster,transfers,relations}.ts`; registrar em `db/schema/index.ts`
4. `pnpm db:generate` → **ler o SQL gerado** (conferir índices parciais e `CHECK`) → `pnpm db:migrate`
5. `db/seed.ts` + script `db:seed`; hook `databaseHooks.user.create.after` em `lib/auth.ts`
6. `lib/market/{money,eligibility,window}.ts` + os três testes puros → `pnpm test`
7. Atualizar `lib/team/types.ts`; **apagar** `lib/team/placeholder.ts`; acrescentar `priceCents` aos fixtures existentes → `pnpm test` verde **antes** de tocar em UI
8. `lib/team/mappers.ts` + `lib/team/queries.ts`
9. `lib/safe-action.ts`, `lib/validations/market.ts`, `app/my-team/actions.ts`
10. Extrair `Panel`; criar `player-price.tsx`; extrair `PlayerIdentity` e adicionar `onSelect`/`selected` em `player-row.tsx` e `formation-board.tsx`
11. `market-player-row.tsx`, `market-summary-bar.tsx`, `market-sheet.tsx`, `roster-panel.tsx`
12. Reescrever `app/my-team/page.tsx`; ajustar `team-stats.tsx` para `formatCredits`
13. Testes de componente e da action → `pnpm test` → `pnpm lint` → `pnpm build`

### Seed (`db/seed.ts`)

Uma rodada `active` com janela aberta e ~24 jogadores (6 por função, preços variados), incluindo os
cinco do `placeholder.ts` para a tela continuar reconhecível. **Precisa haver candidato caro demais
em cada função** — senão o estado bloqueado do requisito 3 nunca aparece na tela.

---

## 9. Verificação ponta a ponta

- `pnpm test` — suíte inteira verde, incluindo os testes já existentes de `components/team/` e
  `components/auth/`, que não podem regredir.
- `pnpm lint` e `pnpm build` limpos (o build pega `any` implícito e erro de tipo do Drizzle).
- `pnpm dev`, logado, com a seed carregada:
  1. `/my-team` mostra time, saldo e "Aberto agora" **vindos do banco**;
  2. clicar num Controlador (na lista **e** no campo) abre o painel só com Controladores;
  3. um caro aparece com o botão bloqueado e o motivo visível;
  4. contratar um acessível troca o card, atualiza o saldo, mantém o "C" na vaga e some da lista;
  5. `pnpm db:studio`: linha nova em `transfer` e `balance_cents` batendo com
     `balance + out_price - in_price`;
  6. mover `market_closes_at` para o passado e recarregar → linhas inertes, alerta no painel.

---

## 10. Riscos e o que fica de fora

**Pode quebrar**

- `.for("update")` não existe em `db.query.*` — usar sempre `select().from().for("update")`.
- `revalidatePath` precisa ficar **fora** da `db.transaction`, depois do commit.
- Radix Sheet no jsdom exige stubs de ponteiro/`ResizeObserver`; sem eles os testes do Sheet falham
  por motivo não relacionado à lógica.
- Índices parciais dependem do `drizzle-kit` emitir o `WHERE`. Revisar o SQL gerado antes do migrate.
- Labels do `pgEnum` com acento são válidos, mas **renomear** um label depois exige migração manual —
  `drizzle-kit` só adiciona valores.
- Acrescentar `priceCents` a `Player` quebra a compilação de dois fixtures de teste (passo 7).

**Fora de escopo, explicitamente**

- Preencher **vaga vazia** — o fluxo exige um jogador saindo para definir a função e o crédito.
- Trocar de capitão (a braçadeira só herda a vaga).
- Countdown **ao vivo**: `closesIn` é formatado no servidor e envelhece até a próxima revalidação.
  Ligar depois com um componente cliente que faz o tick a partir de `closesAt` (já disponível em
  `TeamSummary`) — sem isso não há mismatch de hidratação.
- Busca/filtro/ordenação dentro do mercado e paginação do catálogo.
- Reprecificação entre rodadas (`price_cents` é fixo) e desvalorização na venda — se o produto quiser
  taxa, ela entra em `evaluateSubstitution` (`netCostCents`) e em nenhum outro lugar.
- **`lib/scoring/`** (stats reais → pontos) continua não existindo; `player.score` vem do seed.
  Esta entrega não fecha essa lacuna do CLAUDE.md.
- Atualização otimista da UI; o caminho é `execute` → `revalidatePath` → re-render.
