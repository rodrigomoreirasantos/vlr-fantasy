# Campeonatos e Ranking

## Context

`prompts/03_ranking.md` pede a terceira fatia do produto: o item **"Ranking"** do topo deixa
de ser um placeholder e vira a tela onde o usuário controla os campeonatos de que participa —
cria campeonatos, convida amigos **pelo login**, participa de vários ao mesmo tempo e tem uma
**colocação independente em cada um**.

Hoje nada disso existe. O que existe e condiciona o desenho:

1. **Não há tela logada além de `/my-team`.** O header (logo, nome/pontos do time, nav, saudação,
   sair) está inline em `app/my-team/page.tsx:70-112`, e `SECTIONS` (`:28-34`) é uma lista de
   `<span>` inertes — com o comentário explícito _"Ainda não são links: só `/my-team` existe hoje"_.
   Uma segunda rota logada obriga a extrair esse header.
2. **Não há como identificar um usuário por login.** `user.name` (`db/schema/auth.ts:13`) não é
   único e não existe coluna de login. Convite por nome seria ambíguo.
3. **Não há pontuação persistida.** `player.score` guarda só a rodada corrente e o total do time é
   somado em runtime (`lib/team/queries.ts:61-64`). `lib/scoring/` ainda não existe.
4. **`proxy.ts`** protege apenas `/my-team/:path*`.

**Resultado pretendido:** `/ranking` lista os campeonatos do usuário num seletor, mostra a tabela
de classificação do campeonato selecionado, permite criar um campeonato novo, convidar amigos por
`@login` e aceitar/recusar convites recebidos.

### Decisões de produto (confirmadas)

| Pergunta                       | Decisão                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Como identificar quem convidar | **Login único (`@handle`)** via plugin `username` do better-auth; gerado automaticamente para quem não tiver |
| Base de pontuação do ranking   | **Soma atual do elenco** (`SUM(player.score)` das 5 vagas), isolada para troca futura                        |
| Entrada no campeonato          | **Convite pendente + aceite** (`pending` / `accepted` / `declined`)                                          |
| Usuário sem nenhum campeonato  | **Estado vazio** com CTA "Criar campeonato" — sem liga global automática                                     |

### Fora de escopo (explícito)

- Login com username em `/login` (continua só e-mail e senha).
- Editar/excluir campeonato, remover membro, sair de um campeonato.
- Histórico de pontuação por rodada / `lib/scoring/` — a base do ranking é a soma corrente,
  documentada como provisória.
- Notificação de convite fora da própria tela `/ranking`.

---

## Princípio norteador

A **ordenação e a atribuição de posições são uma função pura** (`rankStandings`), separada da
query. O banco só devolve `{ usuário, time, soma de pontos }` sem ordem garantida; toda a regra de
ranking (desempate, posições compartilhadas em caso de empate, marcação do usuário atual) vive em
TypeScript testável sem banco. Quando a camada de pontuação real existir, muda-se **só** a query
que alimenta essa função — nunca a UI nem a regra de posição.

---

## 1. Login único (`@handle`)

### 1.1 Plugin — `lib/auth.ts` e `lib/auth-client.ts`

```ts
// lib/auth.ts
import { username } from "better-auth/plugins";
// ...
plugins: [
  username({ minUsernameLength: 3, maxUsernameLength: 20 }),
  nextCookies(), // continua sendo o último
],
```

```ts
// lib/auth-client.ts
import { usernameClient } from "better-auth/client/plugins";
export const authClient = createAuthClient({ plugins: [usernameClient()] });
```

O plugin **normaliza para minúsculas** em `user.username` e guarda o original em
`user.displayUsername`; o validador padrão já aceita apenas alfanumérico, `_` e `.`.

### 1.2 Schema — `db/schema/auth.ts`

Adicionar à tabela `user` exatamente o que o plugin declara:

```ts
username: text("username").unique(),
displayUsername: text("display_username"),
```

Nullable de propósito: contas Google e as já existentes nascem sem, e são preenchidas pelo
gerador abaixo. `unique` com `NULL` não conflita entre si no Postgres.

### 1.3 Gerador — `lib/auth/username.ts` (novo)

Duas funções puras + uma com banco:

- `slugifyUsername(seed: string): string` — normaliza acentos (`normalize("NFD")` + remoção de
  diacríticos), minúsculas, troca o que não for `[a-z0-9_.]` por nada, corta em 20, e completa com
  `"jogador"` quando sobra menos de 3 caracteres.
- `generateUniqueUsername(seed: string, exists: (u: string) => Promise<boolean>): Promise<string>` —
  aplica `slugifyUsername` e, havendo colisão, tenta `base2`, `base3`, … (com truncamento para
  respeitar os 20 caracteres). O predicado `exists` entra por parâmetro para o teste não tocar banco.
- `usernameExists(u: string): Promise<boolean>` — `db.query.user.findFirst` por `eq(user.username, u)`.

### 1.4 Hook de criação — `lib/auth.ts`

`databaseHooks.user.create.before` preenche o login quando ele não veio no payload (caso Google):

```ts
before: async (data) => {
  if (data.username) return { data };
  const generated = await generateUniqueUsername(
    data.email.split("@")[0] || data.name,
    usernameExists,
  );
  return { data: { ...data, username: generated, displayUsername: generated } };
},
```

O `after` existente (`ensureFantasyTeam`) fica **inalterado**.

### 1.5 Cadastro — `lib/validations/auth.ts` + `components/auth/sign-up-form.tsx`

Novo campo obrigatório no schema, entre `name` e `email`:

```ts
username: z
  .string()
  .trim()
  .min(3, "Deve ter pelo menos 3 caracteres.")
  .max(20, "Deve ter no máximo 20 caracteres.")
  .regex(/^[a-zA-Z0-9_.]+$/, "Use apenas letras, números, ponto e underline."),
```

No formulário, mais um `<Controller>` no mesmo padrão dos outros (`Field` / `FieldLabel` /
`Input` / `FieldError`), rótulo **"Login"**, `autoComplete="username"`, e `username: values.username`
no `signUp.email({ ... })`. Prefixo `@` só na apresentação — nunca no valor enviado.

### 1.6 Mensagens de erro — `lib/auth-errors.ts`

`translateAuthError` é tipada por `keyof typeof authClient.$ERROR_CODES`; ao adicionar
`usernameClient()` os códigos do plugin entram nessa união (o autocomplete lista os nomes exatos —
`USERNAME_IS_ALREADY_TAKEN`, `INVALID_USERNAME`, `USERNAME_TOO_SHORT`, `USERNAME_TOO_LONG`).
Traduzir cada um que aparecer, ex.: `"Este login já está em uso."`, `"Login inválido. Use apenas
letras, números, ponto e underline."`.

### 1.7 Backfill — `db/seed.ts`

Nova função `backfillUsernames()` chamada em `main()` antes de `seedExistingUsersTeams()`: percorre
`user` com `username IS NULL` e aplica `generateUniqueUsername`. Sem isso, contas criadas antes
desta feature ficam inconvidáveis.

---

## 2. Schema do campeonato — `db/schema/championships.ts` (novo)

```ts
export const championship = pgTable(
  "championship",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt,
    updatedAt,
  },
  (t) => [index("championship_owner_idx").on(t.ownerId)],
);

export const CHAMPIONSHIP_MEMBER_STATUSES = [
  "pending",
  "accepted",
  "declined",
] as const;
export const championshipMemberStatus = pgEnum(
  "championship_member_status",
  CHAMPIONSHIP_MEMBER_STATUSES,
);

export const championshipMember = pgTable(
  "championship_member",
  {
    id: uuid().primaryKey().defaultRandom(),
    championshipId: uuid("championship_id")
      .notNull()
      .references(() => championship.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: championshipMemberStatus("status").notNull().default("pending"),
    invitedById: text("invited_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    invitedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    respondedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("championship_member_unique_uidx").on(
      t.championshipId,
      t.userId,
    ),
    index("championship_member_user_status_idx").on(t.userId, t.status),
  ],
);
```

O `uniqueIndex` é a garantia de "não convidar duas vezes"; um convite recusado é **reaproveitado**
(volta a `pending`), nunca duplicado.

Seguir as convenções vigentes: export no barrel `db/schema/index.ts`, e as `relations()` no
**`db/schema/relations.ts`** (`championshipRelations` com `owner`/`members`,
`championshipMemberRelations` com `championship`/`user`/`invitedBy`) — não no arquivo da tabela.
Estender `userRelations` em `db/schema/auth.ts` com `championshipMemberships: many(championshipMember)`
criaria import cíclico; por isso a relação fica só do lado de `championshipMember`, que é o
suficiente para as queries planejadas.

Migration: `pnpm db:generate` cobre num único arquivo as duas colunas de `user`, o enum e as duas
tabelas. **Nunca editar o SQL gerado.**

---

## 3. Domínio — `lib/championship/`

### 3.1 `types.ts`

```ts
export type ChampionshipSummary = {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
};
export type StandingRow = {
  userId: string;
  userName: string;
  username: string | null;
  teamName: string;
  points: number;
};
export type RankedStanding = StandingRow & {
  position: number;
  isCurrentUser: boolean;
};
export type PendingInvite = {
  memberId: string;
  championshipName: string;
  invitedByUsername: string | null;
  invitedAt: Date;
};
export type PendingMember = {
  memberId: string;
  userName: string;
  username: string | null;
};
```

### 3.2 `standings.ts` — a função pura (coração da feature)

```ts
export function rankStandings(
  rows: readonly StandingRow[],
  currentUserId: string,
): RankedStanding[];
```

- Ordena por `points` desc; empate desempata por `userName` (`localeCompare("pt-BR")`).
- **Posição compartilhada em empate**: `1, 2, 2, 4` (competition ranking) — a posição é o índice do
  primeiro membro do grupo de empate, não o índice da linha.
- Marca `isCurrentUser`.
- Não conhece Drizzle nem React: testável em milissegundos.

### 3.3 `queries.ts` — funções nomeadas (mockáveis, como `lib/team/queries.ts`)

- `listUserChampionships(userId)` — campeonatos com `status = "accepted"`, ordenados por `name`,
  com `memberCount` (contagem de `accepted`).
- `getChampionship(championshipId)` — para validar existência e dono.
- `getStandingRows(championshipId): Promise<StandingRow[]>` — a única query não trivial:

  ```
  championshipMember
    innerJoin user            on member.userId = user.id
    leftJoin  fantasyTeam     on fantasyTeam.userId = user.id
    leftJoin  rosterSlot      on rosterSlot.fantasyTeamId = fantasyTeam.id
    leftJoin  player          on player.id = rosterSlot.playerId
  where member.championshipId = ? and member.status = 'accepted'
  group by user.id, fantasyTeam.id
  ```

  Somar com o helper `sum()` do `drizzle-orm` (devolve `string | null` → `Number(x ?? 0)` no
  mapeamento). **Sem ordenação no SQL** — ela pertence a `rankStandings`. Os `leftJoin` garantem
  que um membro sem time ou com elenco vazio apareça com `0` pontos em vez de sumir.

- `listPendingInvites(userId)` — convites recebidos ainda `pending`.
- `listPendingMembers(championshipId)` — convites enviados ainda `pending` (visível só ao dono).
- `findUserByUsername(tx, username)` — `eq(user.username, username)`, já normalizado.
- `lockMembershipForUpdate(tx, memberId)` — `select().from(championshipMember).where(...).for("update")`,
  seguindo o padrão de `lockTeamForUpdate` (`lib/team/queries.ts:104`).

### 3.4 Normalização do login digitado

`normalizeUsernameInput(raw)` em `lib/auth/username.ts`: `trim()`, remove um `@` inicial,
`toLowerCase()`. Precisa bater exatamente com a normalização do plugin.

---

## 4. Validação — `lib/validations/championship.ts` (novo)

```ts
export const createChampionshipSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Deve ter pelo menos 3 caracteres.")
    .max(40, "Deve ter no máximo 40 caracteres."),
});

export const inviteMemberSchema = z.object({
  championshipId: z.uuid("Campeonato inválido."),
  username: z.string().trim().min(1, "Este campo é obrigatório."),
});

export const respondToInviteSchema = z.object({
  memberId: z.uuid("Convite inválido."),
  accept: z.boolean(),
});
```

Mensagens em pt-BR, `z.uuid()` top-level (nunca `z.string().uuid()`).

---

## 5. Server Actions — `app/(app)/ranking/actions.ts` (novo)

Todas com `authActionClient`, `.inputSchema(...)`, regras bloqueantes via `ActionError` em pt-BR,
escrita dentro de `db.transaction`, `revalidatePath("/ranking")` no fim — igual a
`app/my-team/actions.ts`.

### `createChampionship({ name })`

Numa transação: insere `championship` com `ownerId = ctx.userId` e, em seguida,
`championshipMember` do dono com `status: "accepted"` e `respondedAt: new Date()`. Retorna
`{ championshipId }` para o cliente navegar até `/ranking?c=<id>`.

### `inviteMember({ championshipId, username })`

Numa transação, nesta ordem de checagem:

1. `getChampionship` → inexistente ou `ownerId !== ctx.userId`:
   _"Só quem criou o campeonato pode convidar."_
2. `findUserByUsername(tx, normalizeUsernameInput(username))` → nulo:
   _"Não encontramos ninguém com o login @{username}."_
3. Alvo é o próprio dono: _"Você já está neste campeonato."_
4. `insert(championshipMember).values({ ..., status: "pending", invitedById: ctx.userId })`
   com `.onConflictDoUpdate({ target: [championshipId, userId], set: { status: "pending", invitedById, invitedAt: new Date(), respondedAt: null }, where: eq(championshipMember.status, "declined") })`
   e `.returning()`. Sem linha retornada, o convite já existia como `pending`/`accepted` — traduzir
   pelo status lido: _"Esse jogador já foi convidado."_ / _"Esse jogador já está no campeonato."_

   O `uniqueIndex` é o que torna essa checagem à prova de duas abas.

### `respondToInvite({ memberId, accept })`

`lockMembershipForUpdate` → recusa quando a linha não existe, quando `userId !== ctx.userId`
(_"Este convite não é seu."_) ou quando `status !== "pending"`
(_"Este convite já foi respondido."_). Atualiza para `accepted`/`declined` com `respondedAt`.

---

## 6. Layout compartilhado e navegação

### 6.1 Route group `app/(app)/`

Mover `app/my-team/` → `app/(app)/my-team/` (com `actions.ts` e `actions.test.ts`) e criar
`app/(app)/ranking/`. As **URLs não mudam** — `/my-team` continua `/my-team` e
`revalidatePath("/my-team")` segue válido.

`app/(app)/layout.tsx` (Server Component): resolve a sessão, redireciona para `/login` se não
houver, garante o time (mesmo fallback `ensureFantasyTeam` de hoje) e renderiza
`<AppHeader />` + `{children}` dentro do `min-h-screen bg-background`.

Para o layout e a página não consultarem o banco duas vezes, envolver `getTeamOverview` em
`cache()` do React (`lib/team/queries.ts`) — uma linha, e a chamada em ambos passa a compartilhar
o resultado dentro do mesmo request.

### 6.2 `components/layout/app-header.tsx` (novo, client)

Recebe `{ teamName, points, userName }` por prop (o layout resolve no servidor) e usa
`usePathname()` para o estado ativo — substitui o `current: true` fixo de `SECTIONS`.

Marcação copiada de `app/my-team/page.tsx:70-112`, com uma mudança: os itens com rota viram
`<Link>`; os demais continuam `<span>` inerte, pelo mesmo motivo do comentário original.

```ts
const SECTIONS = [
  { label: "Início", icon: Home },
  { label: "Perfil", icon: User },
  { label: "Escalação", icon: Crosshair, href: "/my-team" },
  { label: "Ranking", icon: Trophy, href: "/ranking" },
  { label: "Menu", icon: Menu },
];
```

Ativo = `href && pathname.startsWith(href)`, mantendo `aria-current="page"` e as classes
`text-primary` / `text-muted-foreground` atuais.

### 6.3 `components/layout/panel.tsx`

Mover `components/team/panel.tsx` (moldura chanfrada padrão) — é genérico e a tela de ranking o
reaproveita. Um único import a atualizar: `components/team/roster-panel.tsx:13`.

### 6.4 `proxy.ts`

```ts
const PROTECTED_PREFIXES = ["/my-team", "/ranking"];
// ...
if (!sessionCookie && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) { ... }
export const config = { matcher: ["/my-team/:path*", "/ranking/:path*", "/login", "/signup"] };
```

---

## 7. UI — `/ranking`

Componentes shadcn a instalar: **`select`**, **`table`**, **`dialog`**
(`pnpm dlx shadcn@latest add select table dialog`). `button`, `input`, `field`, `badge`, `alert`,
`sonner` já existem. Só variáveis de tema de `app/globals.css` — nada de cor Tailwind crua — e a
assinatura `clip-corner` nas molduras.

### `app/(app)/ranking/page.tsx` (Server Component)

```tsx
export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
});
```

(Next 16: `searchParams` é Promise e precisa de `await`.)

1. `listUserChampionships(userId)` e `listPendingInvites(userId)`.
2. Campeonato selecionado = o de `?c=` **se o usuário for membro dele**, senão o primeiro da lista.
   Um `?c=` de campeonato alheio cai no primeiro — nunca vaza classificação de fora.
3. Selecionado existindo: `getStandingRows` → `rankStandings(rows, userId)`; se o usuário for o
   dono, também `listPendingMembers`.

Layout: `<PendingInvites>` no topo (quando houver), depois a barra com
`<ChampionshipSelector>` + botão "Criar campeonato", depois `<StandingsTable>`, e por último o
`<Panel title="Convidados">` do dono. Sem campeonato aceito: o estado vazio com troféu e o CTA.

### Componentes em `components/championship/`

| Componente                       | Tipo   | Papel                                                                                                                                                                                          |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `championship-selector.tsx`      | client | `Select` do shadcn; `onValueChange` → `router.push(\`/ranking?c=\${id}\`)`. Rótulo acessível "Campeonato". Um só campeonato: renderiza texto estático, sem `Select`.                           |
| `standings-table.tsx`            | server | `Table` do shadcn: `#`, Time, Login, Pts. Linha do usuário atual com `ring-1 ring-primary/40`; pontos via `formatScore` (`lib/team/score.ts`) e `tabular-nums text-info`, no padrão do header. |
| `create-championship-dialog.tsx` | client | `Dialog` + RHF/Zod (`createChampionshipSchema`) + `useAction(createChampionship)`; no sucesso, `toast.success("Campeonato criado!")` e `router.push` para o novo `?c=`.                        |
| `invite-member-form.tsx`         | client | Só para o dono. `Input` com prefixo visual `@` + `useAction(inviteMember)`; erro do servidor via `toast.error(error.serverError ?? …)`, como em `roster-panel.tsx`.                            |
| `pending-invites.tsx`            | client | Cada convite com "Aceitar" / "Recusar" chamando `respondToInvite`; data formatada com **dayjs** (nunca `Date` nativo).                                                                         |
| `empty-championships.tsx`        | server | Estado vazio: troféu, "Você ainda não está em nenhum campeonato." e o `CreateChampionshipDialog` como CTA.                                                                                     |

Nota visível na tela, abaixo da tabela, para não prometer o que ainda não existe:
_"A pontuação considera o elenco atual desta rodada."_

---

## Arquivos tocados

| Arquivo                                         | Mudança                                                         |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `lib/auth.ts`                                   | plugin `username()`; hook `create.before` gerando login         |
| `lib/auth-client.ts`                            | `usernameClient()`                                              |
| `lib/auth-errors.ts`                            | traduções dos códigos de username                               |
| `lib/auth/username.ts`                          | **novo** — slug, geração única, normalização de entrada         |
| `db/schema/auth.ts`                             | `username` (unique) + `displayUsername` em `user`               |
| `db/schema/championships.ts`                    | **novo** — `championship`, `championshipMember`, enum de status |
| `db/schema/index.ts` · `relations.ts`           | barrel + `relations()` das tabelas novas                        |
| `drizzle/00XX_*.sql`                            | **gerado** por `pnpm db:generate`                               |
| `db/seed.ts`                                    | `backfillUsernames()`                                           |
| `lib/validations/auth.ts`                       | campo `username` no cadastro                                    |
| `lib/validations/championship.ts`               | **novo** — 3 schemas                                            |
| `components/auth/sign-up-form.tsx`              | campo "Login"                                                   |
| `lib/championship/{types,standings,queries}.ts` | **novos** — domínio, ranking puro, queries nomeadas             |
| `lib/team/queries.ts`                           | `getTeamOverview` envolvida em `cache()`                        |
| `app/(app)/layout.tsx`                          | **novo** — sessão + header compartilhado                        |
| `app/(app)/my-team/*`                           | movido de `app/my-team/*`; header sai da página                 |
| `app/(app)/ranking/{page,actions}.ts(x)`        | **novos**                                                       |
| `components/layout/{app-header,panel}.tsx`      | **novo** / movido de `components/team/panel.tsx`                |
| `components/team/roster-panel.tsx`              | import do `Panel`                                               |
| `components/championship/*`                     | **novos** — 6 componentes                                       |
| `components/ui/{select,table,dialog}.tsx`       | **novos** — shadcn                                              |
| `proxy.ts`                                      | protege `/ranking`                                              |

---

## Ordem de execução

0. Copiar este plano para `.claude/plans/03-ranking-campeonatos.md`.
1. `lib/auth/username.ts` + testes puros.
2. Plugin `username` (`lib/auth.ts`, `lib/auth-client.ts`, `db/schema/auth.ts`, `auth-errors`,
   `validations/auth`, `sign-up-form` + teste) — **sem migration ainda**.
3. `db/schema/championships.ts` + barrel + relations → `pnpm db:generate` (uma migration cobrindo
   2 e 3) → `pnpm db:migrate` → `backfillUsernames` em `db/seed.ts` → `pnpm db:seed`.
4. `lib/championship/{types,standings}.ts` + `standings.test.ts` (puro, sem banco).
5. `lib/championship/queries.ts` + `lib/validations/championship.ts` + `app/(app)/ranking/actions.ts`
   - `actions.test.ts`.
6. Route group: mover `my-team`, `app/(app)/layout.tsx`, `components/layout/{app-header,panel}.tsx`,
   `proxy.ts` + testes. Rodar a suíte aqui — é o passo com maior risco de import quebrado.
7. `pnpm dlx shadcn@latest add select table dialog`.
8. `components/championship/*` + testes.
9. `app/(app)/ranking/page.tsx`.
10. `pnpm test` → `pnpm lint` → `pnpm exec prettier --write .` → `pnpm build`.

---

## Verificação

### Testes (Vitest 4 + RTL, `pnpm test`) — usar a skill `react-testing-library`

Padrões já estabelecidos: `vi.hoisted()` + `vi.mock("@/db", () => ({ db: { transaction } }))` com
`txStub`, mock **individual** das primitivas nomeadas de `lib/championship/queries.ts` (nunca montar
cadeia `select().from().where()` no teste), import da action **depois** dos `vi.mock`, queries de
componente sempre por role/label acessível. Banco **sempre** mockado.

**Novos:**

- `lib/championship/standings.test.ts` — ordem por pontos desc; empate compartilha posição
  (`1, 2, 2, 4`); desempate por nome; membro sem time e membro com elenco vazio aparecem com `0`;
  `isCurrentUser` marca exatamente uma linha.
- `lib/auth/username.test.ts` — acentos e espaços viram slug válido; caracteres proibidos somem;
  seed curto vira `jogador`; colisão gera `base2`, `base3`; truncamento respeita 20 caracteres;
  `normalizeUsernameInput("  @Rodrigo ")` → `"rodrigo"`.
- `app/(app)/ranking/actions.test.ts` — `createChampionship` insere dono como `accepted`;
  `inviteMember` recusa não-dono, login inexistente, autoconvite e convite repetido, e **reativa**
  um `declined`; `respondToInvite` recusa convite de outro usuário e convite já respondido.
- `components/championship/*.test.tsx` — `standings-table`: posições e destaque da linha do usuário;
  `create-championship-dialog`: nome curto mostra erro pt-BR e não chama `execute`;
  `invite-member-form`: envia o login sem `@`; `pending-invites`: "Aceitar" chama `execute` com
  `accept: true`; `championship-selector`: sem `Select` quando há um campeonato só.
- `components/layout/app-header.test.tsx` — com `usePathname` mockado em `/ranking`, o item
  "Ranking" tem `aria-current="page"` e "Escalação" não; itens sem rota não são links.

**Quebra e precisa ser atualizado:** `components/auth/sign-up-form.test.tsx` — o formulário passa a
ter o campo "Login" obrigatório, e `signUp.email` recebe `username`.

### Manual (`pnpm dev`)

1. `pnpm db:migrate && pnpm db:seed` → toda conta existente ganha um `@login`.
2. Criar duas contas em `/signup` com logins distintos (o campo "Login" recusa espaço e acento).
3. Conta A em `/ranking`: estado vazio → "Criar campeonato" → a tabela aparece com A em 1º.
4. A convida `@b` → "Esse jogador já foi convidado." na segunda tentativa; `@naoexiste` → erro de
   login não encontrado; o próprio `@a` → "Você já está neste campeonato."
5. Conta B em `/ranking`: convite pendente → **Recusar** some da lista; A reconvida; B **Aceita** →
   B entra na tabela e o campeonato aparece no seletor de B.
6. B cria um segundo campeonato → o seletor de B lista dois, e a posição de B difere entre eles
   (o requisito de "colocação única por campeonato").
7. B troca um jogador em `/my-team` por outro de pontuação diferente → ao voltar a `/ranking`, os
   pontos e a ordem acompanham (comportamento esperado da base de pontuação escolhida).
8. Navegação: clicar em "Ranking" e "Escalação" no topo troca de tela e o item ativo fica vermelho;
   abrir `/ranking` deslogado redireciona para `/login`.
9. `?c=<uuid-de-campeonato-alheio>` cai no primeiro campeonato do usuário, sem vazar classificação.
