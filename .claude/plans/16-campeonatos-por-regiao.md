# Campeonatos por região: a região vira o eixo do Ranking, o nome vira único e o pódio ganha faixa

## Context

`prompts/16_camps_per_region_and_team.md` pede cinco coisas. Conferidas contra o código, três já
estão prontas desde os planos 03 e 10 — e o pedido, lido como novidade, mandaria refazer o que já
existe. O que falta é bem menor e bem mais específico do que o texto sugere.

**Já implementado (não refazer):**

1. **Campeonato já tem região obrigatória.** `championship.region` é `eventRegionEnum(...).notNull()`
   com CHECK `championship_region_is_team` impedindo `"other"` (`db/schema/championships.ts:28,40`).
   O diálogo de criação já obriga a escolher (`components/championship/create-championship-dialog.tsx:144-170`)
   e o Zod já valida (`lib/validations/championship.ts:11`).
2. **"Amigo só entra com o time da região do dono" já é estrutura, não regra a escrever.** A
   classificação junta `fantasy_team` **pela região do campeonato**
   (`lib/championship/queries.ts:136-142` e `:230-236`): quem é membro de um campeonato de EMEA
   entra na tabela com o elenco EMEA dele, e nunca com outro. O comentário no próprio arquivo
   explica o porquê: sem esse predicado, cada membro viraria 5 linhas e o `sum` somaria os 5 elencos.
3. **"Um time por usuário por campeonato" também é estrutura.** `championship_member_unique_uidx`
   impede duas linhas do mesmo par campeonato/usuário (`db/schema/championships.ts:77-80`), e
   `fantasy_team_user_region_uidx` impede dois times da mesma região por usuário
   (`db/schema/fantasy-teams.ts:52`). Não há como ter dois times seus no mesmo campeonato.
4. **Todo usuário já tem os 5 times.** `ensureFantasyTeam` insere as 5 regiões de uma vez
   (`lib/team/queries.ts:470-476`), então ninguém entra num campeonato de uma região "sem time" —
   no máximo com o elenco daquela região vazio, que a classificação mostra como 0 pontos.

**O que de fato falta:**

5. **Nome não é único.** `name: text("name").notNull()` sem índice algum
   (`db/schema/championships.ts:20`). Dois campeonatos "Liga dos Cria" convivem hoje. Existe o
   precedente exato de como resolver: `fantasy_identity_name_uidx` sobre `lower(btrim(name))`
   (`db/schema/fantasy-identity.ts:44-46`), com migration manual de desduplicação **antes** do
   índice (`drizzle/0005_dedupe_team_names.sql`) e captura de `isUniqueViolation` na Server Action
   (`app/(app)/profile/actions.ts:44-54`).
6. **A tela de Ranking ignora a região.** `app/(app)/ranking/page.tsx:88-102` é uma lista plana: um
   `Select` com **todos** os campeonatos misturados e a tabela do selecionado. A região só aparece
   numa frase no rodapé do painel (`:98-101`). O usuário não consegue "ver separadamente os
   campeonatos por região", que é o pedido central.
7. **A tabela não tem faixa de classificação.** `StandingsTable` destaca apenas a linha do próprio
   usuário com um anel (`components/championship/standings-table.tsx:218-221`); os 3 primeiros são
   linhas iguais às outras.
8. **O convite não diz de que região é o campeonato.** `PendingInvite` não carrega região
   (`lib/championship/types.ts:34-40`), o card do convite mostra só nome e data
   (`components/championship/pending-invites.tsx:56-65`) e o `Select` de convite do Perfil lista os
   campeonatos só pelo nome (`components/profile/invite-friend-dialog.tsx`). Quem aceita não sabe
   com qual dos seus 5 times vai jogar — exatamente a regra do item 2, invisível.

**Resultado esperado:** em `/ranking`, abas de região no topo separam os campeonatos por liga; dentro
da aba, o usuário troca entre os campeonatos daquela região e vê a classificação com os 3 primeiros
numa faixa de destaque, com a própria linha marcada. Criar campeonato com nome já usado é recusado
com mensagem em pt-BR, e todo convite mostra a região em que se vai jogar.

## Suposições (a entrevista foi rodada contra o código — confirme antes de executar)

`AskUserQuestion` não existe dentro de subagente, então não houve canal com o usuário. Cada linha
abaixo é a resposta mais defensável dado o código, **não** uma decisão confirmada. Se alguma for
recusada, só as fases citadas mudam.

| #   | Pergunta                                                 | Suposição adotada                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Como "separar por região" na tela?                       | **Abas de região no topo do Ranking**, reaproveitando `<RegionTabs>` (`components/team/region-tabs.tsx`), hoje fixo em `/my-team`. Dentro da aba, o `Select` de campeonatos filtrado àquela região e a tabela do selecionado. Rejeitadas: seções empilhadas (5 tabelas na mesma tela) e só agrupar o `Select` (região continuaria detalhe, não eixo). |
| 2   | Escopo da unicidade do nome                              | **Global**, sobre `lower(btrim(name))` — é o que o pedido diz ("mesmo nome de um campeonato já existente") e é a mesma chave do nome de time.                                                                                                                                                                                                         |
| 3   | Faixa de rebaixamento também?                            | **Não.** Só a faixa dos 3 primeiros (1º em destaque forte, 2º e 3º em faixa suave) e uma divisória depois do 3º. Ninguém é rebaixado de nada neste jogo; pintar os últimos de vermelho pune sem consequência.                                                                                                                                         |
| 4   | Faixa em campeonato com 3 membros ou menos               | **Não aparece.** Com 3 linhas, marcar as 3 como "classificadas" não distingue nada. Regra pura: pódio só com `total > 3`.                                                                                                                                                                                                                             |
| 5   | Criar campeonato Internacional fora da janela do torneio | **Permitido** — as 5 regiões sempre no `Select` de criação. Campeonato é de longa duração, e o time internacional de todo usuário já existe.                                                                                                                                                                                                          |
| 6   | Parâmetro de URL das abas                                | **Reusa `?region=`**, o parâmetro global que o `proxy.ts` intercepta e grava no cookie (`proxy.ts:53-70`) — a região do app continua sendo uma só, e o `RegionSwitcher` do header passa a fazer sentido em `/ranking`. As abas do Ranking **não** carregam o `c` da região anterior.                                                                  |
| 7   | `?c=<id>` de campeonato de outra região                  | **O `?c=` manda**: a região efetiva da tela passa a ser a do campeonato pedido. Sem isso, os links já existentes (`components/profile/championship-placements.tsx:61` e o `router.push` do diálogo de criação, `create-championship-dialog.tsx:90`) cairiam numa aba vazia.                                                                           |
| 8   | Aba resolvida sem nenhum campeonato                      | Sem `?region=` explícito, a tela **cai na primeira região que tenha campeonato** (ordem de `TEAM_REGIONS`). Com `?region=` explícito (o usuário clicou a aba), respeita a escolha e mostra o vazio com CTA "Criar campeonato em {Região}".                                                                                                            |
| 9   | Região no convite                                        | **Entra**: `PendingInvite` ganha `region`, o card do convite ganha o chip de região, e o `Select` do Perfil mostra a região de cada campeonato próprio.                                                                                                                                                                                               |

## Invariantes que não podem quebrar

- **Cor só por token de tema.** Região por `regionColor()` (`lib/round/regions.ts:229`, devolve
  `var(--chart-N)` para ir num `style`); faixa por `primary`/`success`, que existem em
  `app/globals.css:67,77`. Nunca `bg-amber-400` e afins (regra do `CLAUDE.md`).
- **Ordenação e posição continuam em `rankStandings`** (`lib/championship/standings.ts:60`), sem
  SQL de ordenação. A faixa é derivada da posição, também em função pura.
- **Nada de SQL cru fora de migration.** O índice único vai no schema Drizzle com
  `uniqueIndex(...).on(sql\`lower(btrim(...))\`)`, igual a `fantasy-identity.ts:44-46`.
- **A autoridade da unicidade é o banco**, não um `SELECT` antes — o comentário de
  `app/(app)/profile/actions.ts:36-39` já explica: checar antes deixa brecha entre duas abas.
- **`<RegionTabs>` e `<RegionSwitcher>` usam `<Link prefetch={false}>`** de propósito
  (`components/team/region-tabs.tsx:25-28`): o `proxy.ts` grava cookie na resposta, e prefetch
  reescreveria a região sem o usuário ter clicado. Manter `prefetch={false}`.
- **Testes com banco mockado**, `vi.hoisted()` + `vi.mock("@/db", ...)` no padrão de
  `app/(app)/ranking/actions.test.ts:1-50`, e queries de componente por role/label (RTL).

---

## Fase 0 — domínio puro: a faixa de classificação

Antes de qualquer pixel, a regra da faixa vira função pura, no mesmo arquivo onde a regra de posição
já mora.

**Arquivos**

- `lib/championship/standings.ts` — muda (acrescenta, não altera `rankStandings`).
- `lib/championship/standings.test.ts` — muda (novos casos).

**O que muda**

```ts
/** Quantas vagas a faixa de classificação destaca — o pódio de sempre. */
export const PODIUM_SIZE = 3;

export type StandingZone = "leader" | "podium" | null;

/**
 * A faixa de uma linha da tabela. `total <= PODIUM_SIZE` devolve `null` para
 * todo mundo: num campeonato de 3, destacar os 3 não distingue ninguém.
 * Empate herda a posição (`rankStandings`), então dois segundos lugares ficam
 * os dois na faixa — que é o comportamento de tabela de liga de verdade.
 */
export function standingZone(position: number, total: number): StandingZone {
  if (total <= PODIUM_SIZE) return null;
  if (position === 1) return "leader";
  return position <= PODIUM_SIZE ? "podium" : null;
}
```

**Testes** (`lib/championship/standings.test.ts`)

- 5 membros: posições 1 → `"leader"`, 2 e 3 → `"podium"`, 4 e 5 → `null`.
- 3 membros: todas as posições → `null`.
- 4 membros com empate em 2º (posições 1, 2, 2, 4): as duas linhas de posição 2 são `"podium"` e a
  de posição 4 é `null`.

**Como verificar:** `pnpm test lib/championship/standings.test.ts`.

---

## Fase 1 — nome de campeonato único

**Arquivos**

- `drizzle/00XX_dedupe_championship_names.sql` — **novo**, gerado vazio por
  `pnpm exec drizzle-kit generate --custom --name dedupe_championship_names` e escrito à mão (é
  migration custom, não SQL gerado — mesmo caso de `drizzle/0005_dedupe_team_names.sql`).
- `db/schema/championships.ts` — muda (índice único).
- `drizzle/00XX_*.sql` — **gerado** por `pnpm db:generate`, depois do custom.
- `lib/championship/name.ts` — **novo**.
- `app/(app)/ranking/actions.ts` — muda (`createChampionship`).
- `app/(app)/ranking/actions.test.ts` — muda.

**O que muda**

1. Desduplicação antes do índice (espelha `0005`, trocando a tabela e a coluna de ordem):

```sql
-- Renomeia campeonatos com nome repetido antes de criar o índice único:
-- mantém o mais antigo e sufixa os demais com " #2", " #3", …
WITH ranked AS (
  SELECT id, name, row_number() OVER (
    PARTITION BY lower(btrim(name)) ORDER BY created_at, id
  ) AS rn
  FROM championship
)
UPDATE championship c
SET name = ranked.name || ' #' || ranked.rn
FROM ranked
WHERE c.id = ranked.id AND ranked.rn > 1;
```

2. No schema, dentro do array de `(table) => [...]` de `championship`:

```ts
// Nome único globalmente, ignorando maiúsculas e espaços nas bordas — mesma
// chave e mesmo espírito de `fantasy_identity_name_uidx`.
uniqueIndex("championship_name_uidx").on(sql`lower(btrim(${table.name}))`),
```

3. `lib/championship/name.ts` — normalização que casa com a chave do índice:

```ts
/** `trim()` + colapso de espaços internos — o que de fato vai para o banco. */
export function normalizeChampionshipName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}
```

(Espelha `normalizeTeamName`, `lib/team/team-name.ts:7`. Não some acento: o índice é
`lower(btrim(...))`, então TS e banco precisam concordar.)

4. `createChampionship` (`app/(app)/ranking/actions.ts:28-41`) passa a normalizar e a traduzir a
   violação — **sem** `SELECT` prévio, pelo motivo documentado em
   `app/(app)/profile/actions.ts:36-39`:

```ts
const name = normalizeChampionshipName(parsedInput.name);
let championshipId: string;
try {
  championshipId = await db.transaction((tx) =>
    insertChampionshipWithOwner(tx, {
      name,
      ownerId: ctx.userId,
      region: parsedInput.region,
    }),
  );
} catch (error) {
  if (isUniqueViolation(error)) {
    throw new ActionError(
      "Já existe um campeonato com esse nome. Escolha outro.",
    );
  }
  throw error;
}
```

**Testes** (`app/(app)/ranking/actions.test.ts`)

- `insertChampionshipWithOwner` rejeitando com `Object.assign(new Error("dup"), { code: "23505" })`
  → a action devolve `serverError` com "Já existe um campeonato com esse nome. Escolha outro." e
  **não** chama `revalidatePath`.
- Nome com espaços duplicados (`"  Liga   dos Cria "`) chega normalizado (`"Liga dos Cria"`) em
  `insertChampionshipWithOwner`.
- Erro que não é violação de unique continua propagando (não vira a mensagem de nome duplicado).

**Como verificar:** `pnpm db:migrate` roda as duas migrations em ordem; `pnpm test app/(app)/ranking`;
na tela, criar dois campeonatos com o mesmo nome mostra o toast de erro (o diálogo já trata
`error.serverError`, `create-championship-dialog.tsx:93-95`).

---

## Fase 2 — a região vira o eixo de `/ranking`

**Arquivos**

- `lib/championship/regions.ts` — **novo** (duas funções puras).
- `lib/championship/regions.test.ts` — **novo**.
- `components/team/region-tabs.tsx` — muda (ganha `pathname`).
- `components/team/region-tabs.test.tsx` — muda.
- `components/championship/create-championship-dialog.tsx` — muda (`defaultRegion`).
- `components/championship/empty-championships.tsx` — muda (região no texto e no CTA).
- `app/(app)/ranking/page.tsx` — muda (o grosso).

**O que muda**

1. `lib/championship/regions.ts` — a escolha da aba, testável sem banco:

```ts
/**
 * A região efetiva da tela de Ranking, em ordem de prioridade:
 * 1. a região do campeonato pedido por `?c=` — os links de /home e /perfil
 *    apontam para `/ranking?c=<id>` sem região, e não podem cair numa aba vazia;
 * 2. o `?region=` explícito (o usuário clicou a aba) — respeitado mesmo vazio,
 *    senão clicar na aba não faria nada;
 * 3. a região resolvida (cookie/header), se ela tiver campeonato;
 * 4. a primeira região com campeonato, na ordem de `TEAM_REGIONS`;
 * 5. a região resolvida, quando o usuário não tem campeonato nenhum.
 */
export function resolveRankingRegion(args: {
  championships: readonly ChampionshipSummary[];
  requested: ChampionshipSummary | undefined;
  explicit: TeamRegion | null;
  fallback: TeamRegion;
}): TeamRegion;

/**
 * As abas a oferecer: as regiões que a UI aceita agora (`resolveRegion`, que
 * esconde "international" fora da janela do torneio) **mais** qualquer região
 * em que o usuário já tenha campeonato — um campeonato Internacional criado
 * antes do torneio não pode ficar inalcançável. Ordem de `TEAM_REGIONS`.
 */
export function rankingRegionTabs(
  championships: readonly ChampionshipSummary[],
  available: readonly TeamRegion[],
): readonly TeamRegion[];
```

2. `<RegionTabs>` deixa de ser fixo em `/my-team`:

```ts
export type RegionTabsProps = {
  current: TeamRegion;
  available: readonly TeamRegion[];
  /** Rota das abas — `/my-team` por padrão, `/ranking` na tela de campeonatos. */
  pathname?: string;
  params?: Record<string, string | string[] | undefined>;
};
```

com `regionHref(pathname, region, params)` em `region-tabs.tsx:41`. **O Ranking não passa `params`**:
`regionHref` preserva os demais parâmetros (`lib/team/region-href.ts:36-39`), então levar o `c` junto
faria a aba nova abrir o campeonato da aba antiga — e, pela regra da suposição 7, a aba clicada não
teria efeito nenhum.

3. `app/(app)/ranking/page.tsx`, esqueleto da nova resolução (substitui `:35-81`):

```tsx
const searchParams = await props.searchParams;
const requestedId =
  typeof searchParams.c === "string" ? searchParams.c : undefined;
const explicit = parseTeamRegion(searchParams.region);
const { region: fallback, available } = await resolveRegion(
  searchParams.region,
);

const [championships, pendingInvites] = await Promise.all([
  listUserChampionships(session.user.id),
  listPendingInvites(session.user.id),
]);

const requested = championships.find((c) => c.id === requestedId);
const region = resolveRankingRegion({
  championships,
  requested,
  explicit,
  fallback,
});
const tabs = rankingRegionTabs(championships, available);
const inRegion = championships.filter((c) => c.region === region);
const selected = requested ?? inRegion[0];

// Depois de saber a região da tela — o header tem de concordar com a aba.
const overview = await getTeamOverview(
  session.user.id,
  session.user.username ?? session.user.name,
  region,
);
```

Notas obrigatórias no código:

- `getTeamOverview` é memoizada por `(userId, userName, region)` (`lib/team/queries.ts:187`). Quando
  a região da aba difere da que o layout resolveu, **há** uma segunda consulta — é o preço de o
  header mostrar o saldo do time daquela aba, e não de outro.
- O `?c=` alheio continua caindo fora: `requested` sai de `listUserChampionships`, que só devolve
  campeonatos em que o usuário é membro aceito (`lib/championship/queries.ts:44-49`).

Layout da página, de cima para baixo:

1. `<RegionDisplaySync region={region} balanceCents={overview.summary.balanceCents} />`.
2. `<PendingInvites invites={pendingInvites} />` (inalterado aqui; muda na Fase 4).
3. `<RegionTabs current={region} available={tabs} pathname="/ranking" />`.
4. Sem nenhum campeonato **em lugar nenhum**: `<EmptyChampionships region={region} />`.
   Com campeonatos em outra região mas nenhum nesta aba: o mesmo componente, com o texto
   "Você ainda não tem campeonato em {Região}." e o CTA já pré-selecionando a região da aba.
5. Barra: `<ChampionshipSelector championships={inRegion} selectedId={selected.id} />` +
   `<CreateChampionshipDialog defaultRegion={region} />`.
6. `<Panel title="Classificação" actions={<chip da região>}>` com `<StandingsTable>` (Fase 3) e a
   nota de rodapé já existente, agora sem repetir a região (ela está no chip).
7. Painel "Convidados" do dono, inalterado.

O chip da região no `actions` do `Panel` segue o padrão do header: bolinha com
`style={{ backgroundColor: regionColor(region) }}` + `regionLabel(region)`, como em
`components/layout/region-switcher.tsx:34-39`.

4. `<CreateChampionshipDialog>` ganha `defaultRegion?: TeamRegion` usada em `defaultValues`
   (`create-championship-dialog.tsx:81`), com fallback em `DEFAULT_TEAM_REGION`. O `Select` continua
   oferecendo as 5 regiões (suposição 5).

**Testes**

- `lib/championship/regions.test.ts` (puro): `?c=` de EMEA com fallback Americas devolve `"emea"`;
  `?region=` explícito vence o fallback mesmo sem campeonato na região; fallback sem campeonato cai
  na primeira região com campeonato; usuário sem campeonato nenhum devolve o fallback;
  `rankingRegionTabs` inclui `"international"` quando o usuário tem campeonato lá mesmo com
  `available` sem ela, e não duplica regiões.
- `components/team/region-tabs.test.tsx`: com `pathname="/ranking"`, os links apontam para
  `/ranking?region=…`; sem `pathname`, continuam em `/my-team` (garantia de não quebrar a tela de
  escalação).
- `components/championship/create-championship-dialog.test.tsx`: com `defaultRegion="emea"`, o
  `Select` de região abre em "EMEA" e o `execute` recebe `region: "emea"`.
- `components/championship/empty-championships.test.tsx` (**novo**): com `region="pacific"`, o texto
  cita "Pacific" e o botão de criar está presente.

**Como verificar:** `pnpm test`, depois `pnpm dev` — em `/ranking`, clicar cada aba troca a lista de
campeonatos e o header acompanha a região; abrir `/ranking?c=<id de campeonato de outra região>`
seleciona a aba daquele campeonato.

---

## Fase 3 — a faixa de classificação na tabela

**Arquivos**

- `components/championship/standings-table.tsx` — muda.
- `components/championship/standings-table.test.tsx` — muda.

**O que muda**

`StandingsTable` calcula a faixa por linha com `standingZone(row.position, standings.length)` (Fase 0)
e aplica, sem cor literal:

```tsx
const zone = standingZone(row.position, standings.length);
// …
<TableRow
  data-zone={zone ?? undefined}
  className={cn(
    "border-l-2 border-l-transparent",
    zone === "leader" && "border-l-primary bg-primary/8",
    zone === "podium" && "border-l-success/70 bg-success/5",
    // Divisória da faixa: a última linha do pódio fecha o bloco.
    zone !== null && row.position === PODIUM_SIZE && "border-b-2 border-b-dashed border-b-border",
    row.isCurrentUser && "ring-1 ring-primary/40",
  )}
>
```

Na célula da posição, o número ganha o rótulo que a cor sozinha não dá (cor não é informação
acessível):

```tsx
<TableCell className="font-semibold tabular-nums">
  {row.position}
  {zone && (
    <span className="sr-only">
      {zone === "leader" ? " — líder" : " — zona de classificação"}
    </span>
  )}
</TableCell>
```

Abaixo da tabela, uma legenda curta em `text-xs text-muted-foreground` com as duas bolinhas
(`bg-primary` e `bg-success/70`) e o texto "Líder · Zona de classificação". Só aparece quando
`standings.length > PODIUM_SIZE` — mesma condição da faixa, para a legenda nunca explicar algo que
não está na tela.

`primary` (#ff4655) para o líder é deliberado: é a cor da marca, e o líder é o destaque do produto;
`success` (#3ddc84) para 2º e 3º é a leitura de "zona boa" que qualquer tabela de liga usa. Ambos são
tokens de `app/globals.css:67,77`, expostos como utilitários pelo `@theme` (`:30,41`).

**Testes** (`components/championship/standings-table.test.tsx`)

- 5 linhas: a linha 1 tem classe `border-l-primary`, as linhas 2 e 3 têm `border-l-success/70` e a
  linha 4 não tem nenhuma das duas.
- 3 linhas: nenhuma linha tem faixa e a legenda não é renderizada (`queryByText(/zona de classificação/i)`
  nulo).
- Empate em 2º (posições 1, 2, 2, 4 com 4 linhas): as duas linhas de posição 2 têm a faixa de pódio.
- A linha do usuário atual continua com `ring-primary` (o teste que já existe em `:54-69` precisa
  continuar passando — a faixa não pode substituir o anel).
- Leitor de tela: `getByText("— líder", { exact: false })` presente na primeira linha.

**Como verificar:** `pnpm test components/championship`; na tela, um campeonato com 5 membros mostra
a faixa e um com 3 não.

---

## Fase 4 — a região visível em cada convite

**Arquivos**

- `lib/championship/types.ts` — muda (`PendingInvite.region`).
- `lib/championship/queries.ts` — muda (`listPendingInvites`).
- `components/championship/pending-invites.tsx` — muda.
- `components/championship/pending-invites.test.tsx` — muda (fixtures ganham `region`).
- `components/championship/invite-member-form.tsx` — muda (frase de apoio).
- `components/profile/invite-friend-dialog.tsx` — muda (região no `Select`).
- `lib/home/queries.test.ts` / `lib/home/summary.test.ts` — mudam se construírem `PendingInvite`
  à mão (a Home também renderiza `<PendingInvites>`, `app/(app)/home/page.tsx:66`).

**O que muda**

1. `PendingInvite` ganha `region: TeamRegion`, e `listPendingInvites`
   (`lib/championship/queries.ts:284-306`) seleciona `region: championship.region`, mapeando com
   `toTeamRegion(...)` — o mesmo estreitamento que `listUserChampionships` já faz em `:77` (a CHECK
   do banco garante que nunca é `"other"`).
2. No card do convite (`pending-invites.tsx:56-65`), a região entra como chip ao lado do nome, com
   `regionColor`/`regionLabel`, e a linha secundária ganha o texto explicativo:
   _"Você entra com o seu time de {Região}."_ — que é a regra do item 2 do Context, finalmente dita
   em português na tela.
3. `InviteMemberForm` (`components/championship/invite-member-form.tsx`) recebe `region` e mostra a
   mesma frase sob o campo: quem convida sabe com que time o convidado vai jogar. A página passa
   `selected.region`.
4. `InviteFriendDialog` (`components/profile/invite-friend-dialog.tsx`): cada `SelectItem` mostra
   `{nome} · {regionLabel(c.region)}` — `ownedChampionships` já é `ChampionshipSummary[]`, que já
   carrega `region` (`lib/championship/types.ts:9`), então nenhuma query muda aqui.

**Testes**

- `components/championship/pending-invites.test.tsx`: o card mostra o rótulo da região e a frase
  "Você entra com o seu time de EMEA."; "Aceitar" continua chamando `execute` com `accept: true`.
- `components/profile/invite-friend-dialog.test.tsx` (se existir; senão, **novo**): o `Select` lista
  o campeonato com a região ao lado.
- Ajustar os fixtures de `PendingInvite` em `lib/home/*.test.ts` para o campo novo (o TypeScript
  aponta todos: `pnpm exec tsc --noEmit`).

**Como verificar:** `pnpm exec tsc --noEmit` (pega todos os fixtures desatualizados), `pnpm test`,
e na tela: convidar um amigo para um campeonato de EMEA e ver, na conta dele, o convite dizendo EMEA.

---

## Ordem de execução e verificação final

0. Fase 0 (puro) → `pnpm test lib/championship`.
1. Fase 1: migration custom → `pnpm db:generate` → `pnpm db:migrate` → testes da action.
2. Fase 2 → 3 → 4.
3. Fechamento: `pnpm test` → `pnpm lint` → `pnpm exec prettier --write .` → `pnpm build`.

Roteiro manual (`pnpm dev`), com duas contas:

1. A cria "Liga dos Cria" em Americas; tenta criar "liga dos cria" (minúsculas) → recusado com
   "Já existe um campeonato com esse nome. Escolha outro."
2. A cria "Liga EMEA" na região EMEA → a tela salta para a aba EMEA e o header troca para EMEA.
3. A convida B pelo login; na conta de B, o convite mostra o chip EMEA e a frase do time.
4. B aceita → aparece na tabela de EMEA com a pontuação do **elenco EMEA** dele (trocar um jogador
   do time Americas de B não muda nada nessa tabela — é a prova do item 2 do Context).
5. Com 5 membros, a tabela mostra faixa no 1º (vermelho) e no 2º/3º (verde), com divisória depois do
   3º; com 3 membros, nenhuma faixa.
6. Clicar a aba "China" (sem campeonato) mostra o vazio com "Criar campeonato em China" e o `Select`
   do diálogo já em China.
7. Ir para o Perfil, clicar num campeonato de EMEA em "Meus campeonatos" → `/ranking?c=<id>` abre
   direto na aba EMEA.
8. Deslogado, `/ranking` continua redirecionando para `/login` (`proxy.ts:28-33`).

---

## Riscos e o que fica de fora

- **Trocar a aba de região no Ranking troca a região do app inteiro** (grava o cookie via
  `proxy.ts:63-68`): voltar para "Meu Time" mostra o time daquela região. É consequência direta da
  suposição 6 e é coerente com o resto do produto — mas é o efeito colateral mais visível deste
  plano. Se for indesejado, a alternativa é um parâmetro local (`?liga=`) e não sincronizar o header,
  o que reabre a suposição 6 e muda a Fase 2 inteira.
- **Segunda consulta ao time** quando a aba difere da região do cookie (a memoização de
  `getTeamOverview` é por argumentos). É uma consulta a mais por navegação, não um N+1.
- **A migration de desduplicação renomeia dados existentes** ("Liga dos Cria #2"). Em dev é
  inofensivo; se já houver campeonato em produção com nome repetido, o dono verá o nome mudado sem
  aviso. Não há tela de renomear campeonato — ver item abaixo.
- **Fora de escopo (deliberado):** renomear/excluir campeonato, sair de um campeonato, remover
  membro, mudar a região de um campeonato depois de criado, limite de membros, faixa de rebaixamento,
  e qualquer mudança na base de pontuação (continua a soma do elenco ao vivo, com a braçadeira,
  `lib/championship/queries.ts:124-125`).
- **Bug vizinho encontrado, não corrigido:** `EmptyChampionships` só aparece quando o usuário não
  tem campeonato **nenhum** (`app/(app)/ranking/page.tsx:62`); com a região virando eixo, o estado
  "nenhum nesta aba" passa a existir e é tratado na Fase 2. Nada além disso foi alterado nessa
  tela.
