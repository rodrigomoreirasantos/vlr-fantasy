import { and, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import {
  fantasyIdentity,
  fantasyTeam,
  player,
  round,
  rosterSlot,
  transfer,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/errors";
import { lockedOrganizations } from "@/lib/market/lock";
import type { MarketScope } from "@/lib/market/scope";
import { marketScopeFor, scopeOrganizations } from "@/lib/market/scope";
import { marketMatchesFor, nextMarketClose } from "@/lib/market/window";
import {
  hasInternationalEvent,
  qualifiedOrganizations,
} from "@/lib/round/international";
import {
  getLatestFinishedRound,
  getTeamRoundResult,
  listInternationalWindowMatches,
  listMarketLockMatches,
} from "@/lib/round/queries";
import { TEAM_REGIONS, type TeamRegion } from "@/lib/round/regions";
import type { Crest } from "@/lib/crest/types";
import { teamPoints } from "@/lib/scoring/team";
import {
  deriveTeamName,
  nextTeamNameCandidate,
  teamNameKey,
} from "@/lib/team/team-name";
import {
  toDomainPlayer,
  toRosterSlots,
  toTeamSummary,
} from "@/lib/team/mappers";
import { ROSTER_SIZE } from "@/lib/team/types";
import type {
  PlayerRole,
  RosterSlot,
  TeamSummary,
  Player,
} from "@/lib/team/types";

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Aceita o client ou uma transação — sem `any`. */
export type Querier = Database | Transaction;

/** Tentativas de nome em caso de colisão — ver `ensureFantasyTeam`. */
const MAX_TEAM_NAME_ATTEMPTS = 5;

export type TeamOverview = {
  teamId: string;
  region: TeamRegion;
  /** O recorte do mercado deste time — região ou organizações classificadas. */
  scope: MarketScope;
  summary: TeamSummary;
  roster: RosterSlot[];
  /** Organizações cujo mercado fechou hoje — a trava de `evaluateSubstitution`. */
  lockedTeams: string[];
  /** `null` = o tour guiado ainda não foi visto nem pulado (`lib/tour/`). */
  tourCompletedAt: Date | null;
};

export async function getActiveRound(q: Querier = db) {
  return q.query.round.findFirst({ where: eq(round.status, "active") });
}

/**
 * O torneio internacional (Masters/Champions) ativo agora — fonte única das
 * decisões 2 e 3 do plano (`.claude/plans/10-time-por-regiao.md`): se a aba
 * Internacional existe, e quais organizações o mercado dela aceita. Memoizada
 * por request: todo `resolveMarketScope("international", …)` da mesma
 * requisição reaproveita a mesma consulta.
 */
export const getInternationalWindow = cache(
  async (): Promise<{ open: boolean; organizations: string[] }> => {
    const matches = await listInternationalWindowMatches();
    return {
      open: hasInternationalEvent(matches),
      organizations: qualifiedOrganizations(matches),
    };
  },
);

/**
 * O escopo do mercado de um time, a partir da região dele. Só o time
 * Internacional precisa de uma consulta a mais — os quatro regionais
 * resolvem sem tocar o banco.
 *
 * `q` **tem de ser passado dentro de uma transação**: sem ele a leitura cai
 * na versão memoizada (`getInternationalWindow`), que usa o client global e
 * portanto tira uma **segunda** conexão do pool enquanto a transação já
 * segura a primeira. Com substituições concorrentes suficientes, todas as
 * conexões ficam presas em transações abertas esperando por uma conexão
 * extra que nunca vem — o pool trava inteiro. Fora de transação (leitura de
 * página), o default memoizado é o certo: uma consulta por request.
 */
export async function resolveMarketScope(
  region: TeamRegion,
  q?: Querier,
): Promise<MarketScope> {
  if (region !== "international") return marketScopeFor(region, []);

  const organizations = q
    ? qualifiedOrganizations(
        await listInternationalWindowMatches(new Date(), q),
      )
    : (await getInternationalWindow()).organizations;

  return marketScopeFor(region, organizations);
}

/**
 * Leitura crua da visão de **um** dos times do usuário (o da região pedida):
 * resumo (saldo, mercado, pontos) e as cinco vagas da escalação. `null`
 * quando o usuário ainda não tem esse time — quem trata esse caso é
 * `getTeamOverview`, logo abaixo.
 */
async function loadTeamOverview(
  userId: string,
  region: TeamRegion,
): Promise<TeamOverview | null> {
  const team = await db.query.fantasyTeam.findFirst({
    where: and(eq(fantasyTeam.userId, userId), eq(fantasyTeam.region, region)),
    with: {
      identity: true,
      slots: {
        orderBy: (slot, { asc }) => [asc(slot.position)],
        with: { player: true },
      },
    },
  });
  if (!team || !team.identity) return null;

  const [activeRound, lockMatches, scope, latestFinishedRound] =
    await Promise.all([
      getActiveRound(),
      // As partidas que trancam o mercado hoje — a regra do dia
      // (`lockedOrganizations`) substituiu a janela da rodada.
      listMarketLockMatches(),
      resolveMarketScope(region),
      // Para o corte do teto de patrimônio (`BudgetBar`) — precisa da
      // última rodada **fechada**, não da ativa: o corte só acontece no
      // fechamento (Decisão 5, plano 20).
      getLatestFinishedRound(),
    ]);
  const lockedTeams = lockedOrganizations(lockMatches);
  const roster = toRosterSlots(team.slots, scope);
  // A braçadeira dobra a pontuação de quem a usa — única fonte da regra
  // (lib/scoring/team.ts), a mesma que a classificação usa.
  const points = teamPoints(roster);
  // Patrimônio = saldo + valor do elenco (Decisão 3, plano 20) — soma direto
  // dos preços atuais, sem consulta extra.
  const squadValueCents = team.slots.reduce(
    (total, slot) => total + (slot.player?.priceCents ?? 0),
    0,
  );
  const lastResult = latestFinishedRound
    ? await getTeamRoundResult(team.id, latestFinishedRound.id)
    : null;

  return {
    teamId: team.id,
    region,
    scope,
    summary: toTeamSummary(
      team,
      team.identity,
      region,
      activeRound ?? null,
      points,
      {
        // Recortado pelo time: o próximo fechamento de "qualquer campeonato"
        // não é o que vai travar este time — só o dele (mais o internacional,
        // que tranca todo mundo) e, no time Internacional, o das próprias
        // organizações classificadas. Ver `marketMatchesFor`.
        closesAt: nextMarketClose(
          marketMatchesFor(lockMatches, region, scopeOrganizations(scope)),
        ),
      },
      squadValueCents,
      lastResult?.budgetTrimmedCents ?? 0,
    ),
    roster,
    lockedTeams,
    tourCompletedAt: team.identity.tourCompletedAt,
  };
}

/**
 * Visão completa de um dos times do usuário, memoizada por request
 * (`cache()` do React): o layout logado (`app/(app)/layout.tsx`) e a página
 * `/my-team` pedem o mesmo dado no mesmo request e compartilham uma única
 * consulta — desde que os três argumentos batam exatamente, `region`
 * incluída (`.claude/plans/10-time-por-regiao.md`).
 *
 * O fallback de `ensureFantasyTeam` mora **dentro** da função memoizada de
 * propósito. Se ele ficasse no chamador, a primeira leitura memoizaria o
 * `null` e a releitura depois de criar o time devolveria esse `null` cacheado
 * — o motivo pelo qual as duas telas duplicavam a consulta antes.
 */
export const getTeamOverview = cache(
  async (
    userId: string,
    userName: string,
    region: TeamRegion,
  ): Promise<TeamOverview | null> => {
    const overview = await loadTeamOverview(userId, region);
    if (overview) return overview;

    // Contas criadas antes de o mercado existir (ou antes desta região
    // existir) não passaram pelo hook de criação do time
    // (databaseHooks.user.create.after em lib/auth.ts). `ensureFantasyTeam` é
    // idempotente, então serve de fallback aqui.
    await ensureFantasyTeam(userId, userName);
    return loadTeamOverview(userId, region);
  },
);

/**
 * Catálogo do mercado, agrupado por função, dentro do `scope` do time (região
 * ou organizações classificadas — `resolveMarketScope`). Não exclui quem já
 * está escalado — esses candidatos aparecem bloqueados com motivo, e a regra
 * já existe em `evaluateSubstitution` (lib/market/eligibility.ts).
 *
 * Ordenado do mais barato para o mais caro — a UI (`MarketSheet`) reordena
 * de novo com `sortMarketCandidates` (lib/market/ordering.ts) para empurrar
 * quem está bloqueado para o fim, mas já chega quase pronta do banco.
 *
 * Resolve numa única query. Acima de alguns milhares de jogadores isso vira
 * leitura paginada.
 */
export async function getMarketByRole(
  roles: readonly PlayerRole[],
  scope: MarketScope,
): Promise<Record<PlayerRole, Player[]>> {
  const byRole = Object.fromEntries(
    roles.map((role) => [role, [] as Player[]]),
  ) as Record<PlayerRole, Player[]>;
  if (roles.length === 0) return byRole;

  // O time Internacional sem nenhuma organização classificada (torneio ainda
  // não sorteado): mercado vazio sem ir ao banco — a mesma regra que
  // `matchesScope` (lib/market/scope.ts) aplica em JS.
  if (scope.kind === "organizations" && scope.organizations.length === 0) {
    return byRole;
  }

  // ⚠️ Espelha `matchesScope` (lib/market/scope.ts) — as duas precisam
  // concordar sempre. Ver o comentário lá.
  const scopeCondition =
    scope.kind === "region"
      ? eq(player.region, scope.region)
      : inArray(player.team, [...scope.organizations]);

  const rows = await db.query.player.findMany({
    where: and(
      inArray(player.role, roles),
      eq(player.active, true),
      scopeCondition,
    ),
    orderBy: (row, { asc }) => [asc(row.priceCents), asc(row.nickname)],
  });

  for (const row of rows) {
    byRole[row.role].push(toDomainPlayer(row));
  }
  return byRole;
}

// --- Primitivas usadas dentro da `db.transaction` da Server Action ---
// `.for("update")` não existe na API relacional `db.query.*`: o lock precisa
// obrigatoriamente do builder core `select().from().for("update")`.

/**
 * Trava o time **dono da vaga** (`slotId`), nunca uma região vinda do
 * cliente — a região do time é derivada do banco, dentro da mesma
 * transação. Substitui o antigo `lockTeamForUpdate(tx, userId)`: com 5 times
 * por usuário, só o `slotId` diz qual deles a Server Action está mexendo.
 */
export async function lockTeamForSlot(
  tx: Querier,
  userId: string,
  slotId: string,
) {
  const [row] = await tx
    .select({
      id: fantasyTeam.id,
      userId: fantasyTeam.userId,
      region: fantasyTeam.region,
      balanceCents: fantasyTeam.balanceCents,
    })
    .from(fantasyTeam)
    .innerJoin(rosterSlot, eq(rosterSlot.fantasyTeamId, fantasyTeam.id))
    .where(and(eq(rosterSlot.id, slotId), eq(fantasyTeam.userId, userId)))
    .for("update", { of: fantasyTeam });
  return row ?? null;
}

export async function lockSlotForUpdate(
  tx: Querier,
  teamId: string,
  slotId: string,
) {
  const [row] = await tx
    .select()
    .from(rosterSlot)
    .where(and(eq(rosterSlot.id, slotId), eq(rosterSlot.fantasyTeamId, teamId)))
    .for("update");
  return row ?? null;
}

export async function loadPlayersByIds(tx: Querier, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return tx.select().from(player).where(inArray(player.id, ids));
}

export async function loadRosteredPlayerIds(
  tx: Querier,
  teamId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ playerId: rosterSlot.playerId })
    .from(rosterSlot)
    .where(eq(rosterSlot.fantasyTeamId, teamId));
  return rows.flatMap((row) => (row.playerId ? [row.playerId] : []));
}

export async function applySubstitution(
  tx: Querier,
  args: {
    teamId: string;
    slotId: string;
    incomingPlayerId: string;
    outgoingPlayerId: string | null;
    roundId: string;
    outPriceCents: number;
    inPriceCents: number;
    balanceAfterCents: number;
  },
): Promise<void> {
  // A braçadeira pertence à vaga: quem entra herda o "C", então `captain`
  // não é tocado aqui.
  await tx
    .update(rosterSlot)
    .set({ playerId: args.incomingPlayerId })
    .where(eq(rosterSlot.id, args.slotId));

  await tx
    .update(fantasyTeam)
    .set({ balanceCents: args.balanceAfterCents })
    .where(eq(fantasyTeam.id, args.teamId));

  await tx.insert(transfer).values({
    fantasyTeamId: args.teamId,
    roundId: args.roundId,
    rosterSlotId: args.slotId,
    outPlayerId: args.outgoingPlayerId,
    inPlayerId: args.incomingPlayerId,
    outPriceCents: args.outPriceCents,
    inPriceCents: args.inPriceCents,
    balanceAfterCents: args.balanceAfterCents,
  });
}

/**
 * Vende `outgoingPlayerId`: a vaga esvazia e o preço cheio dele é creditado
 * no saldo. Sem `incomingPlayerId` — quem quer contratar alguém no lugar usa
 * `applySubstitution`. A vaga também perde a braçadeira aqui: não existe
 * capitão numa vaga vazia, e deixá-la marcada travaria
 * `roster_slot_single_captain_uidx` até alguém preencher a vaga de novo.
 */
export async function applySale(
  tx: Querier,
  args: {
    teamId: string;
    slotId: string;
    outgoingPlayerId: string;
    roundId: string;
    outPriceCents: number;
    balanceAfterCents: number;
  },
): Promise<void> {
  await tx
    .update(rosterSlot)
    .set({ playerId: null, captain: false })
    .where(eq(rosterSlot.id, args.slotId));

  await tx
    .update(fantasyTeam)
    .set({ balanceCents: args.balanceAfterCents })
    .where(eq(fantasyTeam.id, args.teamId));

  await tx.insert(transfer).values({
    fantasyTeamId: args.teamId,
    roundId: args.roundId,
    rosterSlotId: args.slotId,
    outPlayerId: args.outgoingPlayerId,
    inPlayerId: null,
    outPriceCents: args.outPriceCents,
    inPriceCents: 0,
    balanceAfterCents: args.balanceAfterCents,
  });
}

/**
 * Move a braçadeira de capitão para `slotId`, desmarcando quem era capitão
 * antes. Duas atualizações em sequência, nessa ordem — desmarca, depois
 * marca — para nunca haver duas vagas com `captain = true` ao mesmo tempo,
 * reforçando `roster_slot_single_captain_uidx`.
 */
export async function setTeamCaptain(
  tx: Querier,
  teamId: string,
  slotId: string,
): Promise<void> {
  await tx
    .update(rosterSlot)
    .set({ captain: false })
    .where(
      and(eq(rosterSlot.fantasyTeamId, teamId), eq(rosterSlot.captain, true)),
    );

  await tx
    .update(rosterSlot)
    .set({ captain: true })
    .where(eq(rosterSlot.id, slotId));
}

/**
 * O time já tem alguém com a braçadeira? Usada para marcar automaticamente
 * o primeiro jogador contratado como capitão — um time montado do zero não
 * teria capitão até o usuário clicar no "C" manualmente.
 */
export async function hasCaptain(
  tx: Querier,
  teamId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: rosterSlot.id })
    .from(rosterSlot)
    .where(
      and(eq(rosterSlot.fantasyTeamId, teamId), eq(rosterSlot.captain, true)),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Garante a identidade (nome + brasão) e os **cinco** times do usuário — um
 * por `TeamRegion` — cada um com as cinco vagas vazias. Idempotente — chamada
 * tanto por `databaseHooks.user.create.after` (lib/auth.ts), na criação da
 * conta, quanto como fallback em `getTeamOverview` para quem já existia antes
 * desta região existir.
 *
 * `seed` é o `@login` do usuário (já único) sempre que disponível — o nome
 * de exibição pode se repetir entre contas. Mesmo assim, o nome derivado
 * pode colidir com o de outro usuário: `onConflictDoNothing` só cobre o
 * conflito de `userId` (já ter identidade), então uma colisão de nome ainda
 * lança a violação de `fantasy_identity_name_uidx` — capturada abaixo, com
 * retentativa numerada (`nextTeamNameCandidate`), no mesmo espírito de
 * `assignUsernameWithRetry` (lib/auth/username.ts).
 */
export async function ensureFantasyTeam(
  userId: string,
  seed: string,
): Promise<void> {
  const baseName = deriveTeamName(seed);

  for (let attempt = 1; attempt <= MAX_TEAM_NAME_ATTEMPTS; attempt++) {
    const name =
      attempt === 1 ? baseName : nextTeamNameCandidate(baseName, attempt);

    try {
      await db.transaction(async (tx) => {
        await tx
          .insert(fantasyIdentity)
          .values({ userId, name })
          .onConflictDoNothing({ target: fantasyIdentity.userId });

        const teamRows = await tx
          .insert(fantasyTeam)
          .values(TEAM_REGIONS.map((region) => ({ userId, region })))
          .onConflictDoNothing({
            target: [fantasyTeam.userId, fantasyTeam.region],
          })
          .returning({ id: fantasyTeam.id });

        // Times que já existiam (conta antiga ganhando uma região nova) não
        // vêm no `returning` do `onConflictDoNothing` — busca os 5 de novo
        // para garantir que nenhum fica sem as vagas.
        const teamIds =
          teamRows.length === TEAM_REGIONS.length
            ? teamRows.map((row) => row.id)
            : (
                await tx
                  .select({ id: fantasyTeam.id })
                  .from(fantasyTeam)
                  .where(eq(fantasyTeam.userId, userId))
              ).map((row) => row.id);

        for (const teamId of teamIds) {
          await tx
            .insert(rosterSlot)
            .values(
              Array.from({ length: ROSTER_SIZE }, (_, index) => ({
                fantasyTeamId: teamId,
                position: index + 1,
              })),
            )
            .onConflictDoNothing({
              target: [rosterSlot.fantasyTeamId, rosterSlot.position],
            });
        }
      });
      return;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === MAX_TEAM_NAME_ATTEMPTS) {
        throw error;
      }
      // Colidiu com o nome de outra identidade — tenta o próximo candidato numerado.
    }
  }
}

/**
 * Já existe uma identidade com esse nome? Compara pela mesma chave do índice
 * `fantasy_identity_name_uidx` (`lower(btrim(name))`), então a resposta bate
 * com o que o banco aceitaria.
 *
 * É uma checagem **antecipada**, não a garantia: entre este `SELECT` e o
 * `INSERT`/`UPDATE` outro cadastro pode levar o nome. A autoridade continua
 * sendo o índice único, e quem chama trata `isUniqueViolation`. Serve para o
 * cadastro (app/(auth)/signup/actions.ts) recusar o nome **antes** de criar a
 * conta, em vez de descobrir o conflito com o usuário já criado.
 */
export async function teamNameExists(
  q: Querier,
  name: string,
): Promise<boolean> {
  const [row] = await q
    .select({ id: fantasyIdentity.userId })
    .from(fantasyIdentity)
    .where(sql`lower(btrim(${fantasyIdentity.name})) = ${teamNameKey(name)}`)
    .limit(1);
  return row !== undefined;
}

// --- Primitivas do perfil (app/(app)/profile/actions.ts) ---

/**
 * Renomeia a identidade do próprio usuário. Sem checagem prévia de
 * unicidade — o banco (`fantasy_identity_name_uidx`) é a autoridade; quem
 * chama trata `isUniqueViolation`. `where userId` (nunca por um id vindo do
 * cliente).
 */
export async function updateTeamNameForUser(
  tx: Querier,
  userId: string,
  name: string,
): Promise<void> {
  await tx
    .update(fantasyIdentity)
    .set({ name })
    .where(eq(fantasyIdentity.userId, userId));
}

/** Atualiza as 5 colunas do brasão da identidade do próprio usuário. */
export async function updateTeamCrestForUser(
  tx: Querier,
  userId: string,
  crest: Crest,
): Promise<void> {
  await tx
    .update(fantasyIdentity)
    .set({
      crestShape: crest.shape,
      crestSymbol: crest.symbol,
      crestBg: crest.background,
      crestFg: crest.foreground,
      crestBorder: crest.border,
    })
    .where(eq(fantasyIdentity.userId, userId));
}
