# Um time por região

## Context

Hoje o usuário tem **um** time de 5 jogadores, e o mercado (`MarketSheet`) oferece o catálogo inteiro, agrupado só por função. O resultado é um elenco que mistura Americas, EMEA, Pacific e China — o que não corresponde a como o circuito de Valorant funciona nem a como o usuário lê "meu time".

`prompts/10_team_per_region.md` pede que a aba Escalação passe a ter **um time por região**: ao trocar de região mudam elenco, saldo, mercado de substituição e maior/menor pontuador. A troca de jogador continua permitida só com mercado aberto, e só por jogadores daquela região.

Três coisas bloqueiam isso hoje:

1. **Não existe região de jogador.** `player` não tem coluna nem FK; `vlr_team.region` existe mas nunca é preenchida (`scrape-match.ts:88-93` passa só `{vlrId, name}`) e é _país_, não liga. A região só nasce em runtime, por rodada, via `match.event → eventRegion()`.
2. **O banco proíbe mais de um time por usuário** — `uniqueIndex("fantasy_team_user_uidx").on(userId)` (`db/schema/fantasy-teams.ts:52`).
3. **O ranking duplicaria em silêncio** — `getStandingRowsByChampionship` faz `leftJoin(fantasyTeam, eq(fantasyTeam.userId, user.id))` (`lib/championship/queries.ts:125`); com 5 times, cada membro vira 5 linhas e o `sum` soma os 5 elencos.

**Resultado esperado:** 5 escalações independentes (Americas, EMEA, Pacific, China + Internacional), cada uma com saldo próprio de 200 créditos e mercado restrito; a aba Internacional aparece só durante Masters/Champions e aceita jogadores de qualquer região classificada.

## Decisões tomadas (fechadas na entrevista — não reabrir)

| #   | Decisão                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `player.region` nova, escrita pelo scrap: liga do **evento regional mais recente**. Masters/Champions **não** mudam a liga de ninguém. Cascata: liga própria → liga da organização → `other`. |
| 2   | **5º time "Internacional"**, filtrado por **organizações classificadas** para o evento internacional ativo, não por `player.region`.                                                          |
| 3   | A aba Internacional só existe quando há Masters/Champions no calendário. Time e elenco **permanecem no banco**; ao voltar, quem não está classificado aparece marcado.                        |
| 4   | **Migração = reset.** Apaga `fantasy_team` (cascateia elencos, transferências, snapshots) **e** `championship`. Nomes de time renascem de `deriveTeamName(@login)`.                           |
| 5   | `championship.region` nova; a classificação junta só o time daquela região.                                                                                                                   |
| 6   | **Identidade sobe para o usuário**: nome e brasão saem de `fantasy_team` para `fantasy_identity` (PK = `userId`). `fantasy_team` fica com região + saldo + elenco.                            |
| 7   | Jogador que muda de liga **fica na vaga**, com selo de alerta, e segue pontuando. Sem venda automática (espírito do `needsReview`: segurar em vez de agir).                                   |
| 8   | Header e aba Início seguem a região escolhida. URL `?region=` na escalação + cookie para as demais telas.                                                                                     |
| 9   | Card "Partidas Pontuadas" vira card **"Região"**. Sai `scoredMatches` de `TeamSummary`; as colunas `round.scoredMatches/totalMatches` ficam (o pipeline usa).                                 |
| 10  | Mesmo jogador **pode** ocupar vaga em dois times (ex. Americas e Internacional) — são competições independentes, com orçamentos independentes.                                                |
| 11  | 200 créditos iguais para os 5 times. `INITIAL_BALANCE_CENTS` segue constante única.                                                                                                           |

---

## Fase 0 — Domínio de região (puro, sem banco)

Única fase 100% testável sem DB. Tudo depois importa daqui.

### `lib/round/regions.ts` — **estender, não criar outra fonte**

```ts
export const TEAM_REGIONS = [
  "americas",
  "emea",
  "pacific",
  "china",
  "international",
] as const;
export const LEAGUE_REGIONS = ["americas", "emea", "pacific", "china"] as const;
export const PLAYER_REGIONS = [...LEAGUE_REGIONS, "other"] as const;
export type TeamRegion = (typeof TEAM_REGIONS)[number];
export type LeagueRegion = (typeof LEAGUE_REGIONS)[number];
export type PlayerRegion = (typeof PLAYER_REGIONS)[number];
export const DEFAULT_TEAM_REGION: TeamRegion = "americas";

export function isLeagueRegion(r: EventRegion): r is LeagueRegion;
export function parseTeamRegion(v: unknown): TeamRegion | null; // usado pelo proxy e pelo ?region=
```

Todos são subconjuntos de `EVENT_REGIONS`, então `regionLabel` / `regionColor` / `sortRegions` continuam valendo sem cast.

> **Refinamento da decisão 1:** uma aparição só conta como "regional" se `eventRegion(...) ∈ LEAGUE_REGIONS`. Um evento não reconhecido (`"other"`) **não** derruba quem tem VCT Americas no histórico — senão um torneio obscuro mais recente esconderia o jogador de todas as abas. `"other"` é só o terminal da cascata.

### `lib/player/region.ts` (novo, puro)

```ts
export function latestLeagueAppearance(
  a: readonly RegionalAppearance[],
): { region: LeagueRegion; at: Date } | null;
export function organizationRegions(
  m: readonly OrgMatch[],
): Map<string, LeagueRegion>;
export function resolvePlayerRegion(input: {
  own: readonly RegionalAppearance[];
  organization: LeagueRegion | null;
}): { region: PlayerRegion; sourceAt: Date | null }; // sourceAt não-nulo = veio de partida do próprio jogador
```

### `lib/round/international.ts` (novo, puro)

```ts
export const INTERNATIONAL_LOOKBACK_DAYS = 14; // dia recém-encerrado ainda conta
export const INTERNATIONAL_LOOKAHEAD_DAYS = 45;
export function internationalMatches(m: readonly RoundMatch[]): RoundMatch[]; // matchRegion === "international"
export function hasInternationalEvent(m: readonly RoundMatch[]): boolean; // decisão 3
export function qualifiedOrganizations(m: readonly RoundMatch[]): string[]; // decisão 2 — dedup de teamA/teamB
```

Uma lista de partidas responde as duas perguntas ("a aba existe?" e "quem pode ser contratado?") — mesmo princípio de `matchesInRegion`.

### `lib/market/scope.ts` (novo, puro — **sem importar drizzle**, é consumido por Client Component)

```ts
export type MarketScope =
  | { kind: "region"; region: LeagueRegion }
  | { kind: "organizations"; organizations: readonly string[] };
export function marketScopeFor(
  region: TeamRegion,
  qualified: readonly string[],
): MarketScope;
export function matchesScope(
  scope: MarketScope,
  p: Pick<Player, "team" | "region">,
): boolean;

export type SlotWarning =
  { kind: "out-of-region"; region: PlayerRegion } | { kind: "not-qualified" };
export function slotWarning(
  scope: MarketScope,
  p: Pick<Player, "team" | "region">,
): SlotWarning | null;
```

> ⚠️ **Invariante frágil:** o `WHERE` SQL de `getMarketByRole` e `matchesScope` são duas implementações da mesma regra. Manter o construtor do `WHERE` colado em `lib/team/queries.ts` com comentário cruzado, e testar `matchesScope` com os mesmos casos. A equivalência não é testável sem banco (CLAUDE.md proíbe DB nos testes) — risco assumido e documentado.

---

## Fase 1 — Schema e migrations

### Schema

**`db/schema/players.ts`** — enum novo (reusado por 3 tabelas), 2 colunas, 2 índices, 1 check:

```ts
export const eventRegionEnum = pgEnum("event_region", EVENT_REGIONS);
region: eventRegionEnum("region").notNull().default("other"),
regionSourceAt: timestamp("region_source_at", { withTimezone: true }),  // null = provisória
index("player_region_role_active_idx").on(t.region, t.role, t.active),  // mercado regional
index("player_team_idx").on(t.team),                                    // mercado internacional
check("player_region_not_international", sql`${t.region} <> 'international'`),
```

`regionSourceAt` existe para que "evento **mais recente**" não dependa da ordem em que o scrap roda — sem ela, o backfill varrendo resultados de trás para frente inverte a resposta.

**`db/schema/fantasy-identity.ts`** (novo): `userId text PK → user (cascade)`, `name`, `crestShape/Symbol/Bg/Fg/Border` (movidos, mesmos defaults), timestamps, `uniqueIndex("fantasy_identity_name_uidx").on(sql\`lower(btrim(name))\`)`.

> **Por que tabela nova e não colunas em `user`:** `db/schema/auth.ts` é território do better-auth; regenerar aquele arquivo não pode arrastar nome/brasão junto. PK = `userId` faz "um por usuário" ser **estrutura**, não índice. E a unicidade global de nome continua idêntica (mesma chave de `teamNameKey`) sobre uma tabela de uma linha por usuário — em `fantasy_team` ela passaria a exigir 5 nomes distintos por pessoa.

**`db/schema/fantasy-teams.ts`** — remove `name`, as 5 colunas de brasão e `fantasy_team_name_uidx`; adiciona `region: eventRegionEnum("region").notNull()`, troca o unique por `uniqueIndex("fantasy_team_user_region_uidx").on(t.userId, t.region)`, e `check("fantasy_team_region_is_team", sql\`region <> 'other'\`)`. O check de saldo fica.

**`db/schema/championships.ts`** — `region` notNull + check `<> 'other'` + `index("championship_region_idx")`.

**`db/schema/relations.ts`** — `fantasyIdentityRelations: one(user)` e `fantasyTeam.identity: one(fantasyIdentity, { fields: [fantasyTeam.userId], references: [fantasyIdentity.userId] })`, para `loadTeamOverview` resolver elenco + identidade numa consulta só. **Não tocar** em `auth.ts`.

**`db/schema/index.ts`** — exportar `./fantasy-identity`.

### Migrations — nesta ordem, sem exceção

**M1 — `drizzle-kit generate --custom --name=reset_fantasy_teams`** (precedente: `drizzle/0005_dedupe_team_names.sql`)

```sql
DELETE FROM "fantasy_team";   -- cascateia roster_slot, transfer, round_roster, round_team_result
DELETE FROM "championship";   -- cascateia championship_member
```

**M2 — `drizzle-kit generate`** (diff normal do schema editado): cria `event_region`, `fantasy_identity`, aplica colunas/índices/checks.

> **M2 antes de M1 falha o `db:migrate`:** `ADD COLUMN region NOT NULL` sem default em `fantasy_team`/`championship` com linhas dentro.

**M3 não existe.** A recriação dos 5 times é preguiçosa: `getTeamOverview` já chama `ensureFantasyTeam` como fallback (`lib/team/queries.ts:100-105`), agora criando identidade + 5 times + 25 vagas. Cada usuário se auto-cura no primeiro acesso.

### `db/seed.ts` — **não esquecer, quebra em silêncio**

Jogadores do seed não têm partida → `region` cai em `"other"` → **mercado vazio nas 5 abas** num ambiente novo. Adicionar `region` a cada entrada de `PLAYERS` (≥5 por liga, para o time nascer montável) e deixar `REFERENCE_ROSTER` todo `americas`.

---

## Fase 2 — Região do jogador no pipeline VLR

### Leituras novas em `lib/round/queries.ts`

```ts
listPlayerLeagueAppearances((q = db)); // player_match_stat ⋈ match ⋈ vlr_event (tracked)
listOrganizationMatches((q = db)); // teamA/teamB + event + scheduledAt
listInternationalWindowMatches(now, q); // [now-14d, now+45d], eventos tracked
organizationLeague(tx, organization); // versão pontual, usada no scrape
```

`eventRegion` é regex em TS, então o recorte **não vai** para o `WHERE`: as queries trazem `event` + `vlrEvent.region` e o filtro acontece nas funções puras — padrão que `lib/home/queries.ts` já usa.

### Escrita — `lib/vlr/persist/player-regions.ts` (novo)

```ts
applyMatchPlayerRegions(tx, {
  source: { event, regionCode, scheduledAt },
  playersByOrganization: ReadonlyMap<string, readonly string[]>,
}): Promise<{ updated: number }>
```

1. `const region = eventRegion(source.event, source.regionCode)`
2. **Liga** (`isLeagueRegion`): `UPDATE player SET region, region_source_at WHERE id = ANY(...) AND (region_source_at IS NULL OR region_source_at <= $at)` — o guard torna "mais recente vence" verdadeiro mesmo com o backfill lendo de trás para frente; `<=` mantém o re-scrape idempotente.
3. **Internacional ou desconhecido**: não mexe em quem já tem `region_source_at`. Para os provisórios (`NULL`), resolve `organizationLeague(tx, org)` e grava `region` deixando `region_source_at` nulo — degrau 2 da cascata, aplicado no cold-start.

### Chamada em `lib/vlr/jobs/scrape-match.ts`

Dentro de `persistMatchDetail`, **na mesma transação**, logo após `saveMatchStats`. Ordem obrigatória: `resolvePlayer` → `saveMatchStats` → `applyMatchPlayerRegions`, para um jogador novo nunca ficar um instante fora de todas as abas. `playersByOrganization` se monta de `playerIdByVlrId` + o `teamName` que o loop já conhece; o `regionCode` vem de um `findFirst` no `vlrEvent` recém-upsertado.

### Backfill — `lib/vlr/jobs/sync-player-regions.ts` + `scripts/vlr/regions.ts`

`syncPlayerRegions()` recalcula do zero ignorando o estado atual: `listPlayerLeagueAppearances` + `organizationRegions(await listOrganizationMatches())` → `resolvePlayerRegion` por jogador → `UPDATE` em lote numa transação. Idempotente por construção.

- `package.json`: `"vlr:regions": "tsx scripts/vlr/regions.ts"` (molde: `scripts/vlr/backfill.ts` + `run.ts`).
- Chamar no fim de `lib/vlr/jobs/backfill.ts`, depois de `refreshPlayerAggregates`.
- `doctor.ts` passa a reportar quantos jogadores `active` estão em `"other"` — é o número de invisíveis em todas as abas.

---

## Fase 3 — Multi-time em `lib/team/`

**`types.ts`** — `Player` ganha `region: PlayerRegion`; `RosterSlot` ganha `warning: SlotWarning | null`; `TeamSummary` perde `scoredMatches` e ganha `region: TeamRegion`.

**`mappers.ts`** — `toDomainPlayer` propaga `region`; `toRosterSlots(rows, scope)` calcula `warning` via `slotWarning` (único chamador é `loadTeamOverview`, então o parâmetro pode ser obrigatório); `toTeamSummary(team, identity, region, activeRound, points, { closesAt })` tira nome/brasão de `identity` e some com o bloco `scoredMatches`.

**`queries.ts`**

```ts
export type TeamOverview = { teamId; region: TeamRegion; scope: MarketScope; summary; roster; lockedTeams };

export const getInternationalWindow = cache(async () => ({ open, organizations }));  // decisões 2 e 3
export async function resolveMarketScope(region: TeamRegion, q: Querier = db): Promise<MarketScope>;

async function loadTeamOverview(userId, region);
//   where: and(eq(fantasyTeam.userId, userId), eq(fantasyTeam.region, region))
//   with:  { slots: { orderBy position, with: { player: true } }, identity: true }
export const getTeamOverview = cache(async (userId, userName, region) => ...);

export async function getMarketByRole(roles, scope);
//   region        → + eq(player.region, scope.region)
//   organizations → + inArray(player.team, scope.organizations); lista vazia devolve mapa vazio sem ir ao banco

export async function lockTeamForSlot(tx, userId, slotId);   // substitui lockTeamForUpdate
//   fantasyTeam ⋈ rosterSlot .where(slotId + userId) .for("update", { of: fantasyTeam })
```

`ensureFantasyTeam(userId, seed)` passa a: (1) inserir `fantasy_identity` com o retry de nome existente; (2) inserir `fantasyTeam × TEAM_REGIONS` com `onConflictDoNothing({ target: [userId, region] })` — **trocar o target é obrigatório**, senão o insert explode no 2º time; (3) inserir 5 `rosterSlot` para cada time.

O fallback de `ensureFantasyTeam` **continua dentro** da função memoizada, pelo motivo do comentário atual (`queries.ts:88-96`); a memoização agora é por `(userId, userName, region)`. `updateTeamNameForUser`, `updateTeamCrestForUser`, `teamNameExists` mantêm nome e assinatura, só trocam a tabela alvo — `signup/actions.ts` não muda. `lockSlotForUpdate`, `loadPlayersByIds`, `loadRosteredPlayerIds`, `applySubstitution`, `applySale`, `setTeamCaptain`, `hasCaptain` **não mudam**: já são `teamId`-scoped.

**`app/(app)/my-team/actions.ts`** — trocar `lockTeamForUpdate(tx, ctx.userId)` por `lockTeamForSlot(tx, ctx.userId, slotId)`; a região sai de `team.region`, **nunca do cliente** (elimina a classe inteira de "cliente manda região errada", e nenhum schema Zod muda). Em `substitutePlayer`, antes do `evaluateSubstitution`, resolver `scope` e passá-lo no contexto. `sellPlayer` e `setCaptain` **sem** checagem de região — decisão 7 exige que vender e capitanear quem mudou de liga continue possível.

**`lib/market/eligibility.ts`** — novo `BlockReason` `"out-of-region"`, posicionado **depois** de `same-player`/`already-rostered` e **antes** de `insufficient-balance`: como a decisão 7 garante jogadores fora de região dentro do elenco, "Já é seu" é mais verdadeiro e mais útil ali. Label `"Fora da região"`, mensagem `"Este jogador não atua na região deste time."`. `evaluateSale` não ganha o motivo.

---

## Fase 4 — Estado da região selecionada

**`lib/team/region-selection.ts`** (novo, server-only) — `REGION_COOKIE = "vlr.region"`, `REGION_HEADER = "x-vlr-region"`, `REGION_PARAM = "region"`, e:

```ts
export async function resolveRegion(
  requested?: string | string[],
): Promise<{ region: TeamRegion; available: TeamRegion[] }>;
```

Ordem: `requested` → `headers().get(REGION_HEADER)` → `cookies().get(REGION_COOKIE)` → `DEFAULT_TEAM_REGION`. Depois **clampa**: `"international"` sem torneio aberto cai no default. `available = hasInternational ? TEAM_REGIONS : LEAGUE_REGIONS`. Em Next 16 `cookies()`/`headers()` são async e `searchParams` é `Promise`.

**`proxy.ts`** (estender — o matcher já cobre `/my-team/:path*`), depois do guard de sessão:

```ts
const requested = parseTeamRegion(
  request.nextUrl.searchParams.get(REGION_PARAM),
);
if (!requested) return NextResponse.next();
const headers = new Headers(request.headers);
headers.set(REGION_HEADER, requested);
const response = NextResponse.next({ request: { headers } });
response.cookies.set(REGION_COOKIE, requested, {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: 31536000,
});
return response;
```

> **Por que header _e_ cookie:** `cookies()` num Server Component lê os cookies **de entrada**; o `Set-Cookie` da resposta só vale na próxima navegação. Sem o header, `app/(app)/layout.tsx` (que não recebe `searchParams`) mostraria o time da região anterior por uma navegação inteira. `NextResponse.next({ request: { headers } })` é a API documentada em `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:384-407` — verificada neste repo. O proxy não faz I/O; quem clampa "international sem torneio" é `resolveRegion`.

**Páginas:** `layout.tsx` → `resolveRegion()` e `getTeamOverview(..., region)`; `my-team/page.tsx` → `PageProps<"/my-team">`, `resolveRegion(sp.region)`, `getMarketByRole(PLAYER_ROLES, overview.scope)`; `home/page.tsx` e `profile/page.tsx` → `resolveRegion()` sem param. **Os quatro precisam passar o mesmo terceiro argumento**, senão a memoização de `cache()` deixa de valer e vira consulta duplicada. `lib/home/queries.ts`: `getHomeSummary(userId, userName, region)`.

`revalidatePath("/my-team")` e `("/home")` seguem inalterados — as rotas são dinâmicas (`headers()`/`cookies()`), então `?region=` não cria variantes de cache a invalidar.

---

## Fase 5 — UI

| Arquivo                                               | Mudança                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/team/region-tabs.tsx` **(novo, server)**  | `<nav aria-label="Região">` de `<Link href={"/my-team?region=" + r}>` com `aria-current="page"`, ponto `regionColor(r)` e rótulo `regionLabel(r)`. **Link, não botão** — navegação de verdade: URL compartilhável, back/forward, sem JS. Extrair o `className` de `components/home/filter-chip.tsx` para um helper `chipClasses({ active })` e usar nos dois, em vez de duplicar |
| `components/team/team-stats.tsx`                      | 3º card vira **"Região"**: `regionLabel(summary.region)` com `style={{ color: regionColor(...) }}` (`var(--chart-N)` — token de tema, não cor literal)                                                                                                                                                                                                                           |
| `components/team/player-warning-badge.tsx` **(novo)** | `TriangleAlert` + `Joga em {regionLabel}` / `Fora do internacional`, com `title` explicando. Sem cor literal                                                                                                                                                                                                                                                                     |
| `components/team/player-row.tsx`                      | `PlayerIdentity` ganha `badge?: React.ReactNode`, renderizado na 2ª linha ao lado do chip da organização (onde "onde ele joga" pertence). `PlayerRow` ganha `warning?: SlotWarning \| null`. `MarketPlayerRow` e `PriceMoverList` seguem sem passar nada                                                                                                                         |
| `components/team/formation-board.tsx`                 | `Marker` ganha anel de alerta quando há `warning` — o tabuleiro não pode contradizer a lista                                                                                                                                                                                                                                                                                     |
| `components/team/roster-panel.tsx`                    | Nova prop `scope`; repassa `warning` a cada `PlayerRow` e `scope` ao `MarketSheet`                                                                                                                                                                                                                                                                                               |
| `components/market/market-sheet.tsx`                  | Nova prop `scope`, incluída no `SubstitutionContext` do `useMemo`. `sortMarketCandidates` e `MarketPlayerRow` já exibem `blockReasonLabel` — nada mais muda                                                                                                                                                                                                                      |
| `components/layout/app-header.tsx`                    | Nova prop `region`; pill com `regionLabel`/`regionColor` ao lado dos pontos. **Necessário, não cosmético**: sem ele o usuário vê os pontos mudarem ao trocar de aba e acha que perdeu pontuação                                                                                                                                                                                  |

**Aba Internacional condicional:** `RegionTabs` recebe `available` de `resolveRegion`; sem torneio a aba não é renderizada. Nada é apagado — times e elencos ficam no banco, e `resolveRegion` clampa um cookie órfão. Quando o torneio volta, `slotWarning` marca `{ kind: "not-qualified" }` para escalados fora de `qualifiedOrganizations`.

---

## Fase 6 — Ranking

Fazer **logo após a fase 3**: no intervalo entre as duas, a classificação fica 5× errada.

1. `lib/validations/championship.ts` — `region: z.enum(TEAM_REGIONS, "Escolha uma região válida.")` (Zod v4, mensagem pt-BR).
2. `components/championship/create-championship-dialog.tsx` — `<Select>` shadcn com `TEAM_REGIONS.map(regionLabel)`, default `DEFAULT_TEAM_REGION`. Campeonato internacional é criável mesmo fora de torneio: o campeonato é anual, o torneio é sazonal.
3. `lib/championship/queries.ts` — `insertChampionshipWithOwner(tx, { name, ownerId, region })`; `ChampionshipSummary` ganha `region`. **A correção crítica**, nos dois `getStandingRows*`:
   ```ts
   .innerJoin(championship, eq(championship.id, championshipMember.championshipId))
   .leftJoin(fantasyIdentity, eq(fantasyIdentity.userId, user.id))          // nome + brasão
   .leftJoin(fantasyTeam, and(eq(fantasyTeam.userId, user.id),
                              eq(fantasyTeam.region, championship.region)))  // ← o time da região
   ```
   O `groupBy` troca as colunas de `fantasyTeam` pelas de `fantasyIdentity` — listá-las explicitamente, sem confiar em dependência funcional da PK sob `LEFT JOIN`. Mesmo tratamento em `getStandingRowsForRoundByChampionship` (o `leftJoin(roundTeamResult)` pendura no `fantasyTeam` já filtrado), que é o que a Home usa em `buildRecap`.
4. `app/(app)/ranking/page.tsx` — `regionLabel(selected.region)` ao lado do nome; rodapé "A pontuação considera o seu time de {região} nesta rodada."

---

## Fase 7 — Testes

Vitest 4, `pnpm test`. DB sempre mockado; testes de servidor com `// @vitest-environment node` na 1ª linha.

**Novos:** `lib/player/region.test.ts` (Masters não muda liga; mais recente vence; evento `other` não derruba liga conhecida; sem histórico → org; sem org → `other`; empate de `scheduledAt` determinístico) · `lib/round/international.test.ts` (sem partidas → `open: false`; orgs dedup de ambos os lados; `finished` dentro do lookback conta) · `lib/market/scope.test.ts` (`matchesScope` nos 2 `kind`; `organizations: []` não passa ninguém; `slotWarning` `null` em casa) · `lib/vlr/persist/player-regions.test.ts` (padrão `createTxStub` de `db/close-round.test.ts`: internacional não escreve sobre quem tem `region_source_at`; provisório para quem não tem; partida antiga não regride) · `lib/vlr/jobs/sync-player-regions.test.ts` (`vi.mock("@/db")` + queries nomeadas) · `components/team/region-tabs.test.tsx` (4 abas sem torneio, 5 com; `href`; `aria-current` só na atual) · `components/team/team-stats.test.tsx` (card "Região" presente, "Partidas Pontuadas" ausente).

**Atualizar:** `lib/market/eligibility.test.ts` — os 3 casos que definem a precedência nova: (i) fora de região **e** já escalado → `already-rostered`; (ii) fora de região **e** sem saldo → `out-of-region`; (iii) `evaluateSale` de quem está fora de região **não** bloqueia. · `app/(app)/my-team/actions.test.ts` — `lockTeamForSlotMock` no lugar de `lockTeamForUpdateMock`, mock de `resolveMarketScope`, e o teste novo: **contratar jogador de outra região é recusado mesmo com saldo sobrando**. · `lib/home/queries.test.ts`, `components/team/player-row.test.tsx`, `roster-panel.test.tsx`, `market-sheet.test.tsx`, `create-championship-dialog.test.tsx`, `lib/round/regions.test.ts` (`parseTeamRegion` com lixo do `?region=`), `db/close-round.test.ts` (5 times por usuário → 5 linhas em `round_team_result`).

---

## Ordem de execução

| Fase                                       | O que quebra se trocar                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **0** Domínio puro                         | Nada. Tudo depois importa daqui                                                                     |
| **1** Schema + M1 (wipe) + M2 (DDL) + seed | **M2 antes de M1 falha o `db:migrate`**. Esquecer o seed = mercado vazio nas 5 abas em dev          |
| **2** Pipeline + `pnpm vlr:regions`        | Antes da 1 não há coluna. Depois da 3, todo jogador em `"other"` e **o mercado inteiro fica vazio** |
| **3** `lib/team/` + actions + eligibility  | Quebra muitas assinaturas de uma vez — fazer inteira antes de rodar `pnpm test`                     |
| **6** Ranking                              | Independente das 4–5; adiar deixa a classificação 5× errada                                         |
| **4** Região selecionada + páginas         | Antes da 3 não há terceiro argumento para passar                                                    |
| **5** Componentes                          | Depois da 4 o app já funciona preso no default — dá para validar a 4 isolada                        |
| **7** Varredura de testes                  | —                                                                                                   |

Rodar `pnpm vlr:regions` (ou `pnpm vlr:backfill`) **entre a fase 2 e a 5** em qualquer banco com dados reais.

---

## Riscos

1. **`player.team` é texto solto.** `qualifiedOrganizations` cruza `match.teamA/teamB` com `player.team` por igualdade exata — mesma fragilidade que `lockedOrganizations` já aceita. Se o scoreboard escrever "Sentinels" e a lista "SENTINELS", **o mercado internacional fica vazio**. Mitigação barata: `doctor.ts` reportar orgs classificadas sem `player` correspondente.
2. **Duas noções de "região" convivem de propósito.** Os destaques da Home usam `eventRegion(onde ele pontuou)`; o mercado usa `player.region` (a liga a que pertence). Um jogador de Americas num Masters aparece "internacional" nos destaques e continua "americas" no mercado. **Está certo — não unificar.**
3. **Ordem dos locks continua time → vaga.** `lockTeamForSlot` faz `JOIN ... FOR UPDATE OF fantasy_team`, e `lockSlotForUpdate` vem depois. Inverter reintroduz o deadlock que o comentário em `actions.ts:47-48` previne.
4. **`getInternationalWindow` roda no layout de toda rota logada** — uma query a mais por request, memoizada por `cache()`. Se ficar cara, é candidata a `unstable_cache`; não agora.
5. **`round_team_result` passa a ter 5 linhas por usuário por rodada.** `closeActiveRound` itera `fantasyTeam.findMany()` e funciona sem alteração — só escreve 5×. Vale um teste de regressão.
6. **Perda de dados assumida (decisão 4):** escalações, transferências, snapshots, campeonatos privados e os nomes de time já escolhidos.

---

## Verificação

1. `pnpm test` — suíte inteira verde, incluindo os testes novos das fases 0, 2 e 7.
2. `pnpm lint` e `pnpm exec prettier --write .`.
3. `pnpm db:migrate` num banco com dados (M1 → M2 nessa ordem), depois `pnpm db:seed`.
4. `pnpm vlr:regions` e conferir a distribuição por região no retorno (`byRegion`); `pnpm vlr:doctor` não deve reportar jogadores `active` em `"other"` além dos esperados.
5. `pnpm dev` e, em `/my-team`: trocar entre as abas e confirmar que **elenco, saldo, mercado, maior/menor pontuador e o card "Região"** mudam juntos; que o header acompanha na mesma navegação (não uma atrasada); que `?region=` é compartilhável e o back/forward funciona; que a aba Internacional só aparece com Masters/Champions no calendário; que o `MarketSheet` de Americas não lista jogador de EMEA; e que um jogador que mudou de liga aparece com o selo, ainda vendível.
6. Em `/ranking`: criar campeonato escolhendo região, convidar outra conta e confirmar **uma linha por membro** (não cinco) com a pontuação do time daquela região.
