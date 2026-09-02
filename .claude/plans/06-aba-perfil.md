# Aba de Perfil — identidade do time, amigos e conta

## Context

`prompts/06_profile_tab.md` pede a próxima fatia: o item **"Perfil"** do topo deixa de ser um
`<span>` inerte (`components/layout/app-header.tsx:27`) e vira `/profile`, a tela onde o usuário
controla quem ele é no jogo — nome e **brasão** do time, lista de **amigos**, atalho para os
campeonatos com sua colocação, e os dados de conta (nome de exibição, senha).

O que existe hoje e condiciona o desenho:

1. **`fantasy_team.name` não é único** e nasce como `${user.name} FC` (`deriveTeamName`,
   `lib/team/queries.ts:33`). Dois usuários "Rodrigo" já produzem "Rodrigo FC" duplicado — e o
   prompt é enfático: _"não se pode em hipótese alguma ter times com nomes iguais"_.
2. **Não existe brasão** em lugar nenhum do schema nem da UI.
3. **Não existe amizade.** O único vínculo entre usuários é `championship_member`.
4. **Existe muito a reaproveitar**: o fluxo de convite por `@login` (`inviteMember` +
   `PendingInvites` + `findUserByUsername` + `normalizeUsernameInput`) é exatamente a mecânica do
   pedido de amizade; `rankStandings` já calcula posições; `Panel`, `authActionClient`/`ActionError`
   e `translateAuthError` já padronizam moldura, erros de action e erros de auth em pt-BR.

**Resultado pretendido:** `/profile` mostra o brasão do time num editor com preview ao vivo, permite
renomear o time com unicidade garantida, lista e gerencia amigos (pedido por `@login`, aceite,
remoção, convite para campeonato), resume as colocações do usuário em cada campeonato, e permite
trocar nome de exibição e senha.

### Decisões de produto (confirmadas na entrevista)

| Pergunta                  | Decisão                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Como o brasão é montado   | **SVG paramétrico** — forma + símbolo + 3 cores de paleta, salvos como dados. Sem upload, sem storage              |
| Origem das amizades       | **Tabela `friendship`** com pedido/aceite por `@login` **+ auto-amizade** ao aceitar convite de campeonato         |
| "Ranking" no perfil       | **Minhas colocações** — posição e pontos em cada campeonato, linkando para `/ranking?c=<id>`                       |
| Editável na conta         | **Senha** (com senha atual), **nome de exibição** (`user.name`), **nome do time** (único)                          |
| Unicidade do nome do time | **Índice único em `lower(btrim(name))`** + nome inicial derivado do `@login` (que já é único)                      |
| Ações da lista de amigos  | Enviar pedido · aceitar/recusar · desfazer amizade · convidar para campeonato                                      |
| Onde o brasão aparece     | Perfil (editor) · header do app · tabela de classificação · cards de amigos                                        |
| Layout                    | **Duas colunas** em `lg`: identidade do time à esquerda; pedidos, amigos, campeonatos e conta empilhados à direita |

### Fora de escopo (explícito)

- **`@login` continua imutável** — o handle é a chave de convite; liberá-lo permitiria "roubo" de
  handle recém-liberado. O plugin `username` já suporta `immutableUsername`, mas não vamos ligar
  agora (contas sem login ainda precisam poder receber um).
- Ver o perfil de **outro** usuário — `/profile` é sempre o do próprio usuário logado.
- Upload de imagem / avatar (`user.image` continua sem uso na UI).
- Bloquear usuário, notificação de pedido de amizade fora da própria tela `/profile`.
- Editar/excluir campeonato — o painel de campeonatos é só leitura + link.

---

## Princípio norteador

**O brasão é dado, não imagem.** Cinco colunas de texto em `fantasy_team` descrevem uma composição;
um componente puro `<TeamCrest>` a desenha. Isso significa: zero infraestrutura de storage, brasão
renderizável em qualquer lugar (header, ranking, amigos) sem custo de rede, e uma função pura
`parseCrest` como única fronteira entre o texto solto do banco e o tipo `Crest` — o catálogo pode
crescer sem quebrar linhas antigas.

O mesmo espírito do plano 03: **regra pura, separada da query**. `canonicalPair` (amizade),
`parseCrest` (brasão) e `teamNameKey` (unicidade) são funções puras testáveis em milissegundos.

---

## 1. Brasão

### 1.1 Paleta — `app/globals.css`

Oito cores do brasão como tokens, junto dos demais em `:root, .dark` (nunca cor Tailwind crua):

```css
--crest-red: #ff4655; /* a primária do produto */
--crest-cyan: #4de3ee;
--crest-green: #3ddc84;
--crest-amber: #ffb648;
--crest-violet: #a06cff;
--crest-blue: #3d8bff;
--crest-white: #f2f3f4;
--crest-graphite: #2b2f36;
```

### 1.2 Domínio — `lib/crest/` (novo)

`catalog.ts` — as três listas e o mapa de cor → var CSS, com rótulos pt-BR para acessibilidade:

```ts
export const CREST_SHAPES = ["shield", "diamond", "circle", "chevron", "hex"] as const;
export const CREST_SYMBOLS = ["crosshair", "skull", "bolt", "flame", "star", "swords",
                              "eye", "shield-check", "zap-off", "target", "crown", "ghost"] as const;
export const CREST_COLORS = ["red", "cyan", "green", "amber", "violet", "blue", "white", "graphite"] as const;

export const CREST_COLOR_VARS: Record<CrestColor, string> = { red: "var(--crest-red)", ... };
export const CREST_COLOR_LABELS: Record<CrestColor, string> = { red: "Vermelho", ... };
export const CREST_SHAPE_LABELS / CREST_SYMBOL_LABELS: idem.
```

Os símbolos são **nomes de ícones lucide** (`lucide-react` já é dependência) — nada de path SVG
escrito à mão. `CREST_SYMBOL_ICONS: Record<CrestSymbol, LucideIcon>`.

`types.ts` — `Crest = { shape; symbol; background; foreground; border }`.

`crest.ts` — as funções puras:

- `DEFAULT_CREST` — a composição de fallback.
- `parseCrest(raw: { shape: string; ... }): Crest` — **campo a campo**, cai no default quando o
  texto salvo não está no catálogo. É o que permite renomear/remover um símbolo do catálogo sem
  quebrar linhas antigas.
- `defaultCrestFor(seed: string): Crest` — default determinístico derivado de um hash simples do
  `userId`, para dois times novos não nascerem idênticos.

**Por que `text` e não `pgEnum`:** o catálogo de símbolos vai crescer; cada valor novo num enum do
Postgres é uma migration. O `text` + validação Zod no domínio dá a mesma garantia na borda, sem
migration por símbolo. Registrar esse motivo em comentário no schema.

### 1.3 Schema — `db/schema/fantasy-teams.ts`

Cinco colunas `text().notNull()` com `default` correspondente ao `DEFAULT_CREST`:
`crest_shape`, `crest_symbol`, `crest_bg`, `crest_fg`, `crest_border`.

### 1.4 Componente — `components/crest/team-crest.tsx` (novo, server-safe)

```tsx
<TeamCrest crest={crest} size="sm" | "md" | "lg" title="Brasão de Sentinels BR" />
```

Um `<span className="relative">` com a forma em `<svg viewBox="0 0 64 64" role="img"
aria-label={title}>` (um `<path>` por forma, num `SHAPE_PATHS: Record<CrestShape, string>`),
`fill` = cor de fundo e `stroke` = cor da borda via `style={{ fill: CREST_COLOR_VARS[...] }}`;
o ícone lucide centralizado por cima, com `color` = cor do símbolo. Sem `"use client"` — é
puramente apresentacional e roda nos dois lados.

`size` mapeia para uma caixa em px (`sm: 28`, `md: 44`, `lg: 128`).

---

## 2. Nome de time único

### 2.1 Domínio — `lib/team/team-name.ts` (novo)

`deriveTeamName` **sai** de `lib/team/queries.ts:33` e vem para cá, junto de:

- `normalizeTeamName(raw)` — `trim()` + colapso de espaços internos.
- `teamNameKey(name)` — `normalizeTeamName(name).toLowerCase()`. **Sem remover acentos**: precisa
  bater exatamente com `lower(btrim(name))` do índice, senão a checagem em TS e a do banco divergem.
- `nextTeamNameCandidate(base, attempt)` — `"rodrigo FC 2"`, `"rodrigo FC 3"`, …

### 2.2 Índice — `db/schema/fantasy-teams.ts`

```ts
uniqueIndex("fantasy_team_name_uidx").on(sql`lower(btrim(${table.name}))`);
```

(Índice com expressão **exige nome explícito** no Drizzle — o nome autogerado não funciona aqui.)

### 2.3 Nome inicial pelo `@login`

`user.username` já é `UNIQUE`, então `deriveTeamName(username)` nasce único:

- `lib/auth.ts:50` — `assignUniqueUsername` já devolve o login atribuído; passar esse valor:
  `await ensureFantasyTeam(user.id, assigned ?? user.name)`.
- `app/(app)/layout.tsx` — `getTeamOverview(session.user.id, session.user.username ?? session.user.name)`.
- `db/seed.ts:288` — passar `u.username ?? u.name` (o `backfillUsernames` já roda antes).

`ensureFantasyTeam` ainda pode colidir (alguém renomeou seu time para "rodrigo FC"), então ganha o
**mesmo laço de tentativa** de `assignUsernameWithRetry`: captura `isUniqueViolation` e tenta
`nextTeamNameCandidate`. Para isso, mover `isUniqueViolation` de `lib/auth/username.ts:69` para
**`lib/db/errors.ts`** (novo, 8 linhas) e atualizar os dois pontos de import — o helper não tem nada
de específico de auth e agora tem dois consumidores.

### 2.4 Migrations — duas, nesta ordem

1. **Desduplicação (custom).** `pnpm exec drizzle-kit generate --custom --name dedupe_team_names`,
   e preencher o arquivo vazio gerado:

   ```sql
   WITH ranked AS (
     SELECT id, name, row_number() OVER (
       PARTITION BY lower(btrim(name)) ORDER BY created_at, id
     ) AS rn
     FROM fantasy_team
   )
   UPDATE fantasy_team ft
   SET name = ranked.name || ' #' || ranked.rn
   FROM ranked
   WHERE ft.id = ranked.id AND ranked.rn > 1;
   ```

   > **Nota sobre a regra do CLAUDE.md** (_"nunca edite SQL gerado à mão"_): a regra protege o DDL
   > auto-gerado a partir do schema. `generate --custom` é o fluxo oficial do drizzle-kit para data
   > migrations — nasce **vazio** justamente para ser escrito. Nenhum DDL gerado é tocado.
   >
   > Caso raríssimo: se já existir um time literalmente chamado `"X #2"`, a migration falha no passo
   > 2 (violação de unicidade) — resolver renomeando à mão e rodando de novo.

2. **DDL (gerado).** Depois de escrever os schemas de §1.3, §2.2 e §3, um único `pnpm db:generate`
   cobre as 5 colunas de brasão, o índice único e a tabela `friendship`. **Não editar.**

---

## 3. Amizade — `db/schema/friendships.ts` (novo)

```ts
export const FRIENDSHIP_STATUSES = ["pending", "accepted", "declined"] as const;
export const friendshipStatus = pgEnum(
  "friendship_status",
  FRIENDSHIP_STATUSES,
);

export const friendship = pgTable(
  "friendship",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Par canônico: userAId < userBId sempre (ver `canonicalPair`). É o que
    // impede A→B e B→A coexistirem, usando colunas simples — assim o
    // `onConflictDoUpdate` funciona com alvo de coluna, igual a `upsertPendingMember`.
    userAId: text("user_a_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    userBId: text("user_b_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Quem enviou o pedido — sempre igual a userAId ou userBId.
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: friendshipStatus("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("friendship_pair_uidx").on(t.userAId, t.userBId),
    index("friendship_user_a_status_idx").on(t.userAId, t.status),
    index("friendship_user_b_status_idx").on(t.userBId, t.status),
  ],
);
```

Export no barrel `db/schema/index.ts`; `friendshipRelations` em `db/schema/relations.ts` (nunca no
arquivo da tabela), com `relationName` distinto para cada uma das três FKs para `user` — mesmo
padrão de `championshipMemberRelations`.

### 3.1 `lib/friendship/pair.ts` (novo) — a função pura

```ts
export function canonicalPair(
  x: string,
  y: string,
): { userAId: string; userBId: string } | null;
```

`null` quando `x === y` (autopedido). Caso contrário devolve o par ordenado — **simétrico por
construção**: `canonicalPair(a,b)` e `canonicalPair(b,a)` dão o mesmo resultado.

### 3.2 `lib/friendship/queries.ts` (novo) — primitivas nomeadas

Seguindo `lib/championship/queries.ts` (cada primitiva mockável individualmente, nunca cadeia
`select().from().where()` montada dentro da action):

- `listFriends(userId): Promise<Friend[]>` — **duas consultas, não SQL cru**: uma com
  `userAId = userId` e outra com `userBId = userId`, cada uma `innerJoin user` (o outro lado) e
  `leftJoin fantasyTeam` (nome + colunas do brasão), status `accepted`; concatena e ordena por
  `userName` com `localeCompare("pt-BR")` em JS. Um `JOIN ... ON CASE WHEN` resolveria numa query
  só, mas exigiria `sql` cru — proibido pelo CLAUDE.md fora de migrations.
- `listIncomingFriendRequests(userId)` — `status = "pending"` e `requesterId <> userId`.
- `findFriendshipByPair(tx, pair)` · `lockFriendshipForUpdate(tx, id)` (`.for("update")`, padrão de
  `lockMembershipForUpdate`).
- `upsertFriendRequest(tx, { pair, requesterId })` — `onConflictDoUpdate` com
  `target: [friendship.userAId, friendship.userBId]`, `setWhere: eq(friendship.status, "declined")`.
  `null` quando já existe `pending`/`accepted` — idêntico ao contrato de `upsertPendingMember`.
- `updateFriendshipStatus(tx, { id, status })` · `deleteFriendship(tx, id)`.
- `ensureFriendship(tx, x, y)` — insere `accepted` com `onConflictDoNothing`. Usado pela
  auto-amizade. **`DoNothing`, não `DoUpdate`**: um vínculo já existente (inclusive um `declined`
  deliberado) nunca é sobrescrito por um efeito colateral de campeonato.

### 3.3 Auto-amizade — `app/(app)/ranking/actions.ts`

Dentro da transação de `respondToInvite`, quando `accept === true` e `member.invitedById` existe:

```ts
const pair = canonicalPair(ctx.userId, member.invitedById);
if (pair) await ensureFriendship(tx, pair, member.invitedById);
```

Mesma transação do aceite — ou entra tudo, ou nada.

---

## 4. Reuso e refatorações em código existente

### 4.1 Convite de campeonato extraído — `lib/championship/`

`inviteMember` hoje mistura "achar o usuário pelo login" com "convidar um usuário". O perfil precisa
só da segunda metade (já tem o `userId` do amigo). Extrair para `queries.ts`:

```ts
export type InviteBlockReason =
  "not_owner" | "self" | "already_member" | "already_invited";
export async function inviteUserToChampionship(
  tx: Querier,
  args: { championshipId: string; ownerId: string; targetUserId: string },
): Promise<{ ok: true } | { ok: false; reason: InviteBlockReason }>;
```

Devolve um resultado, **não lança** — no estilo de `evaluateSubstitution` (`lib/market/eligibility.ts`);
quem traduz é `inviteBlockMessage(reason)` em `lib/championship/format.ts`, com as mensagens pt-BR
que hoje estão inline na action. `inviteMember` (ranking) e `inviteFriendToChampionship` (perfil)
passam a compartilhar as duas funções.

### 4.2 Colocações em lote — `lib/championship/queries.ts`

`getStandingRows(championshipId)` vira caso particular de:

```ts
export async function getStandingRowsByChampionship(
  championshipIds: readonly string[],
): Promise<Map<string, StandingRow[]>>;
```

Mesma query com `inArray`, mais `championshipMember.championshipId` no `select` e no `groupBy`. O
perfil resolve **todas** as colocações numa consulta só e aplica `rankStandings` por grupo —
nenhuma regra de ranking duplicada.

### 4.3 Brasão no `StandingRow` e no `TeamSummary`

- `lib/championship/types.ts` — `StandingRow` ganha `crest: Crest`; a query seleciona as 5 colunas
  (que entram no `GROUP BY` junto de `fantasyTeam.id`) e passa por `parseCrest`.
- `lib/team/types.ts` + `lib/team/mappers.ts` — `TeamSummary` ganha `crest`, preenchido em
  `toTeamSummary`. Daí o `app/(app)/layout.tsx` passa `crest` para `<AppHeader>`, que renderiza um
  `<TeamCrest size="sm">` antes do nome do time. `getTeamOverview` já é memoizada por request, então
  o header não custa consulta nova.
- `components/championship/standings-table.tsx` — `<TeamCrest size="sm">` na coluna "Time".

### 4.4 Navegação

- `components/layout/app-header.tsx:27` — o item "Perfil" ganha `href: "/profile"` (vira `<Link>`
  com `aria-current` automaticamente, pela lógica que já existe).
- `proxy.ts` — `"/profile"` em `PROTECTED_PREFIXES` **e** `"/profile/:path*"` no `matcher`.

### 4.5 Erros de auth — `lib/auth-errors.ts`

Dois códigos novos para o painel de conta:

```ts
INVALID_PASSWORD: "Senha atual incorreta.",
SESSION_EXPIRED: "Por segurança, entre novamente antes de trocar a senha.",
```

`changePassword` roda sob `sensitiveSessionMiddleware` do better-auth: uma sessão mais velha que
`session.freshAge` é rejeitada, e sem essa tradução o usuário veria a mensagem genérica.

---

## 5. Validação — `lib/validations/profile.ts` (novo)

Tudo em pt-BR, `z.uuid()` top-level (nunca `z.string().uuid()`):

```ts
export const updateTeamNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Deve ter pelo menos 3 caracteres.")
    .max(30, "Deve ter no máximo 30 caracteres."),
});

export const crestSchema = z.object({
  shape: z.enum(CREST_SHAPES, "Escolha um formato válido."),
  symbol: z.enum(CREST_SYMBOLS, "Escolha um símbolo válido."),
  background: z.enum(CREST_COLORS, "Escolha uma cor válida."),
  foreground: z.enum(CREST_COLORS, "Escolha uma cor válida."),
  border: z.enum(CREST_COLORS, "Escolha uma cor válida."),
});

export const sendFriendRequestSchema = z.object({
  username: z.string().trim().min(1, "Este campo é obrigatório."),
});
export const respondToFriendRequestSchema = z.object({
  friendshipId: z.uuid("Pedido inválido."),
  accept: z.boolean(),
});
export const removeFriendSchema = z.object({
  friendshipId: z.uuid("Amizade inválida."),
});
export const inviteFriendToChampionshipSchema = z.object({
  championshipId: z.uuid("Campeonato inválido."),
  friendUserId: z.string().min(1, "Amigo inválido."),
});

// Formulários client-side (authClient), sem Server Action:
export const displayNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Deve ter pelo menos 2 caracteres.")
    .max(50, "Deve ter no máximo 50 caracteres."),
});
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Este campo é obrigatório."),
    newPassword: z.string().min(8, "Deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(1, "Este campo é obrigatório."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });
```

---

## 6. Server Actions — `app/(app)/profile/actions.ts` (novo)

Todas com `authActionClient`, bloqueio via `ActionError` em pt-BR, escrita dentro de
`db.transaction`, `revalidatePath("/profile")` no fim — o padrão de `app/(app)/ranking/actions.ts`.

| Action                       | Regra                                                                                                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateTeamName`             | `normalizeTeamName` → `update` do time do usuário. Captura `isUniqueViolation` → _"Já existe um time com esse nome. Escolha outro."_ **O banco é a autoridade**: checar antes com `SELECT` deixaria brecha entre abas                                                                         |
| `updateTeamCrest`            | `update` das 5 colunas no time do próprio usuário (`where userId = ctx.userId` — nunca por `teamId` vindo do cliente)                                                                                                                                                                         |
| `sendFriendRequest`          | `findUserByUsername(tx, normalizeUsernameInput(u))` → nulo: _"Não encontramos ninguém com o login @x."_ · `canonicalPair` nulo: _"Você não pode adicionar a si mesmo."_ · `upsertFriendRequest` nulo → lê o status: _"Vocês já são amigos."_ / _"Você já enviou um pedido para essa pessoa."_ |
| `respondToFriendRequest`     | `lockFriendshipForUpdate` → recusa se o usuário não é parte do par, se **é ele o `requesterId`** (não se aceita o próprio pedido), ou se o status não é `pending`                                                                                                                             |
| `removeFriend`               | `lockFriendshipForUpdate` → recusa se o usuário não é parte do par → `deleteFriendship`                                                                                                                                                                                                       |
| `inviteFriendToChampionship` | `inviteUserToChampionship(tx, …)` (§4.1) → `inviteBlockMessage(reason)`. Também `revalidatePath("/ranking")`                                                                                                                                                                                  |

**Nome de exibição e senha não são Server Actions** — vão por `authClient.updateUser({ name })` e
`authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` no cliente,
com `translateAuthError`, no mesmo padrão já usado em `components/auth/sign-up-form.tsx`. No sucesso,
`router.refresh()` para o header refletir o nome novo.

---

## 7. UI — `/profile`

Só variáveis de tema de `app/globals.css`, assinatura `clip-corner` via `<Panel>`
(`components/layout/panel.tsx`), dark mode Valorant. **Nenhum componente shadcn novo a instalar** —
`dialog`, `select`, `button`, `input`, `field`, `badge`, `alert`, `sonner` já existem.

### `app/(app)/profile/page.tsx` (Server Component)

Resolve em paralelo: `getTeamOverview` (memoizada, já resolvida pelo layout),
`listUserChampionships`, `listFriends`, `listIncomingFriendRequests`, `hasPasswordAccount`. Depois,
uma única `getStandingRowsByChampionship(ids)` e `rankStandings` por grupo para extrair a colocação
do usuário em cada campeonato.

Layout: `grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]`.

### Componentes

| Arquivo                                          | Tipo   | Papel                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/crest/team-crest.tsx`                | server | O brasão desenhado. Reutilizado em 4 telas                                                                                                                                                                                                                                                               |
| `components/profile/crest-editor.tsx`            | client | RHF sobre `crestSchema` + `useAction(updateTeamCrest)`. `<TeamCrest size="lg">` com `form.watch()` = preview ao vivo. Cada grupo de opções é um `radiogroup` com `<input type="radio" className="sr-only">` dentro de `<label>` — acessível e consultável por `getByRole("radio", { name: "Vermelho" })` |
| `components/profile/team-name-form.tsx`          | client | Input + `useAction(updateTeamName)`; sucesso → `toast` + `router.refresh()` (header)                                                                                                                                                                                                                     |
| `components/profile/friend-requests.tsx`         | client | Pedidos recebidos com "Aceitar"/"Recusar" — clone estrutural de `PendingInvites`, com `formatInvitedAt` (dayjs) reaproveitado                                                                                                                                                                            |
| `components/profile/add-friend-form.tsx`         | client | Input com prefixo visual `@` — mesma marcação de `InviteMemberForm`                                                                                                                                                                                                                                      |
| `components/profile/friends-list.tsx`            | client | Card por amigo: `<TeamCrest size="sm">`, nome do time, `@login`, e as ações "Convidar" e "Remover" (remoção confirmada num `Dialog`)                                                                                                                                                                     |
| `components/profile/invite-friend-dialog.tsx`    | client | `Dialog` + `Select` dos campeonatos em que o usuário é **dono** → `inviteFriendToChampionship`. Sem campeonatos próprios: mensagem em vez de select                                                                                                                                                      |
| `components/profile/championship-placements.tsx` | server | Lista "Liga dos Amigos · 2º de 6 · 148 pts" com `<Link href={/ranking?c=id}>`; pontos com `formatScore` + `tabular-nums text-info`, no padrão do header                                                                                                                                                  |
| `components/profile/account-panel.tsx`           | client | Form de nome de exibição + form de senha. O de senha só renderiza quando `hasPassword`; caso contrário, um aviso _"Você entra com o Google — não há senha para alterar."_                                                                                                                                |

Estados vazios em pt-BR para amigos (_"Você ainda não tem amigos. Convide alguém pelo login."_) e
campeonatos (_"Você ainda não está em nenhum campeonato."_ com link para `/ranking`).

---

## Arquivos tocados

| Arquivo                                                    | Mudança                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `app/globals.css`                                          | 8 tokens `--crest-*`                                                            |
| `lib/crest/{catalog,types,crest}.ts`                       | **novos** — catálogo, tipo, `parseCrest` / `defaultCrestFor`                    |
| `lib/db/errors.ts`                                         | **novo** — `isUniqueViolation` movida de `lib/auth/username.ts`                 |
| `lib/team/team-name.ts`                                    | **novo** — `deriveTeamName` movida + normalização e candidatos                  |
| `lib/friendship/{pair,types,queries}.ts`                   | **novos** — par canônico, tipos, primitivas                                     |
| `lib/validations/profile.ts`                               | **novo** — 8 schemas                                                            |
| `lib/profile/queries.ts`                                   | **novo** — `hasPasswordAccount`                                                 |
| `db/schema/fantasy-teams.ts`                               | 5 colunas de brasão + `fantasy_team_name_uidx`                                  |
| `db/schema/friendships.ts`                                 | **novo** — tabela + enum                                                        |
| `db/schema/{index,relations}.ts`                           | barrel + `friendshipRelations`                                                  |
| `drizzle/00XX_dedupe_team_names.sql`                       | **custom** — desduplicação (§2.4)                                               |
| `drizzle/00XX_*.sql`                                       | **gerado** — brasão + índice + `friendship`                                     |
| `lib/auth.ts` · `db/seed.ts` · `app/(app)/layout.tsx`      | nome do time derivado do `@login`; `crest` no header                            |
| `lib/auth/username.ts`                                     | importa `isUniqueViolation` do novo lugar                                       |
| `lib/auth-errors.ts`                                       | `INVALID_PASSWORD`, `SESSION_EXPIRED`                                           |
| `lib/team/{queries,types,mappers}.ts`                      | retry de nome em `ensureFantasyTeam`; `crest` em `TeamSummary`                  |
| `lib/championship/{queries,types,format}.ts`               | `getStandingRowsByChampionship`, `inviteUserToChampionship`, `crest`, mensagens |
| `app/(app)/ranking/actions.ts`                             | auto-amizade no aceite; usa o convite extraído                                  |
| `app/(app)/profile/{page,actions}.ts(x)`                   | **novos**                                                                       |
| `components/crest/team-crest.tsx` · `components/profile/*` | **novos** — 1 + 8 componentes                                                   |
| `components/layout/app-header.tsx`                         | "Perfil" vira link; brasão ao lado do nome do time                              |
| `components/championship/standings-table.tsx`              | brasão na coluna "Time"                                                         |
| `proxy.ts`                                                 | protege `/profile`                                                              |

---

## Ordem de execução

0. Copiar este plano para **`.claude/plans/06-aba-perfil.md`**.
1. **Domínio puro, sem banco** (tudo testável de imediato): `lib/crest/*`, `lib/team/team-name.ts`,
   `lib/friendship/pair.ts`, `lib/db/errors.ts` + os 4 arquivos de teste.
2. **Schema**: colunas de brasão, índice único, `friendships.ts`, barrel, relations.
3. **Migrations, nesta ordem**: `generate --custom` (desduplicação) → `pnpm db:generate` (DDL) →
   `pnpm db:migrate` → `pnpm db:seed`. **Passo de maior risco** — validar no `db:studio` que nenhum
   nome de time duplicado sobrou antes de seguir.
4. Nome do time pelo `@login` + retry em `ensureFantasyTeam` (`lib/auth.ts`, `lib/team/queries.ts`,
   `db/seed.ts`, `app/(app)/layout.tsx`).
5. `lib/friendship/queries.ts`, `lib/profile/queries.ts`, `lib/validations/profile.ts`.
6. Refatorações de reuso (§4.1 e §4.2) + atualizar `app/(app)/ranking/actions.ts` com a
   auto-amizade. **Rodar a suíte aqui** — é onde código já testado muda de forma.
7. `app/(app)/profile/actions.ts` + `actions.test.ts`.
8. `components/crest/team-crest.tsx` + `components/profile/*` + testes.
9. `app/(app)/profile/page.tsx`, header, `standings-table`, `proxy.ts` + atualizar os testes que
   quebram.
10. `pnpm test` → `pnpm lint` → `pnpm exec prettier --write .` → `pnpm build`.

---

## Verificação

### Testes (Vitest 4 + RTL, `pnpm test`) — usar a skill `react-testing-library`

Padrões já estabelecidos no projeto: `vi.hoisted()` + `vi.mock("@/db", () => ({ db: { transaction } }))`
com `txStub`; mock **individual** de cada primitiva nomeada de `queries.ts` (nunca montar cadeia
`select().from().where()` no teste); import da action **depois** dos `vi.mock`; queries de componente
sempre por role/label acessível. Banco **sempre** mockado.

**Novos:**

- `lib/crest/crest.test.ts` — `parseCrest` cai no default campo a campo para valor fora do catálogo
  e preserva os válidos; `defaultCrestFor` é determinístico e dá composições diferentes para seeds
  diferentes.
- `lib/team/team-name.test.ts` — `normalizeTeamName` colapsa espaços; `teamNameKey` iguala
  `"Sentinels BR"` e `"  sentinels   br "` e **não** iguala `"Sentinéls BR"` (acento importa, como
  no índice); `nextTeamNameCandidate` numera a partir de 2.
- `lib/friendship/pair.test.ts` — simetria (`canonicalPair(a,b) === canonicalPair(b,a)`); `null`
  para ids iguais.
- `app/(app)/profile/actions.test.ts` — `updateTeamName` traduz violação de unicidade para a
  mensagem pt-BR e deixa qualquer outro erro subir; `updateTeamCrest` escreve no time do próprio
  usuário; `sendFriendRequest` recusa autopedido, login inexistente e pedido repetido, e **reativa**
  um `declined`; `respondToFriendRequest` recusa pedido alheio, o próprio pedido e pedido já
  respondido; `removeFriend` recusa amizade de terceiros; `inviteFriendToChampionship` recusa
  não-dono.
- `components/crest/team-crest.test.tsx` — `getByRole("img", { name: … })`; forma e símbolo
  desconhecidos ainda renderizam (via `parseCrest`).
- `components/profile/*.test.tsx` — `crest-editor`: marcar "Ciano" atualiza o preview e envia
  `background: "cyan"`; `team-name-form`: nome com 2 caracteres mostra erro pt-BR e **não** chama
  `execute`; `friend-requests`: "Aceitar" chama `execute` com `accept: true`; `friends-list`:
  "Remover" só chama `execute` depois da confirmação no diálogo; `account-panel`: senhas diferentes
  mostram "As senhas não conferem." e o form de senha **não** renderiza com `hasPassword={false}`;
  `championship-placements`: renderiza "2º de 6" e linka para `/ranking?c=<id>`.

**Quebram e precisam ser atualizados** (mudança de tipo/props, não de comportamento):

- `components/layout/app-header.test.tsx` — "Perfil" agora é `<Link>` com `aria-current` em
  `/profile`; o header recebe `crest`.
- Qualquer teste que construa um `StandingRow` ou um `TeamSummary` — os tipos ganharam `crest`
  (`components/championship/standings-table.test.tsx`, `lib/championship/standings.test.ts`,
  `app/(app)/ranking/actions.test.ts`).

### Manual (`pnpm dev`)

1. `pnpm db:migrate && pnpm db:seed` — nenhum erro de unicidade; no `db:studio`, nenhum
   `lower(btrim(name))` repetido em `fantasy_team`.
2. Criar uma conta nova em `/signup` → o time nasce como `"<login> FC"` e com um brasão default
   diferente do de outra conta nova.
3. `/profile`: trocar forma, símbolo e as três cores → o preview muda **antes** de salvar; "Salvar
   brasão" → o brasão novo aparece no header sem recarregar a página.
4. Renomear o time para o nome exato de outro time (variando maiúsculas: `"SENTINELS BR"` vs
   `"Sentinels BR"`) → erro _"Já existe um time com esse nome."_; renomear para um nome livre →
   header e `/ranking` acompanham.
5. Conta A envia pedido para `@b` → segunda tentativa dá _"Você já enviou um pedido para essa
   pessoa."_; `@naoexiste` → erro de login; o próprio `@a` → _"Você não pode adicionar a si mesmo."_
6. Conta B em `/profile`: aceita → A e B aparecem na lista um do outro, com o brasão do time do
   outro; B remove a amizade → some dos dois lados.
7. **Auto-amizade**: A cria um campeonato e convida `@c` (sem pedido de amizade nenhum); C aceita em
   `/ranking` → C aparece na lista de amigos de A e vice-versa.
8. No card de um amigo, "Convidar" → escolher um campeonato próprio → o convite aparece em
   "Convidados" na `/ranking`.
9. Painel de campeonatos: a colocação bate com a de `/ranking`; clicar leva ao campeonato certo.
   Trocar um jogador em `/my-team` muda os pontos nos dois lugares.
10. Conta: trocar o nome de exibição → "Olá, X" no header muda. Trocar a senha com a atual errada →
    _"Senha atual incorreta."_; com a certa → sair e entrar com a nova funciona. Numa conta só do
    Google, o form de senha não aparece.
11. `/profile` deslogado redireciona para `/login`; o item "Perfil" no topo fica vermelho quando
    ativo.
