import { and, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { fantasyTeam, player, round, rosterSlot, transfer } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/errors";
import { lockedOrganizations } from "@/lib/market/lock";
import { nextMarketClose } from "@/lib/market/window";
import { listMarketLockMatches } from "@/lib/round/queries";
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

/** As cinco vagas fixas de toda escalação. */
const ROSTER_SIZE = 5;

/** Tentativas de nome em caso de colisão — ver `ensureFantasyTeam`. */
const MAX_TEAM_NAME_ATTEMPTS = 5;

export type TeamOverview = {
  teamId: string;
  summary: TeamSummary;
  roster: RosterSlot[];
  /** Organizações cujo mercado fechou hoje — a trava de `evaluateSubstitution`. */
  lockedTeams: string[];
};

export async function getActiveRound(q: Querier = db) {
  return q.query.round.findFirst({ where: eq(round.status, "active") });
}

/**
 * Leitura crua da visão do time: resumo (saldo, mercado, pontos) e as cinco
 * vagas da escalação. `null` quando o usuário ainda não tem time — quem trata
 * esse caso é `getTeamOverview`, logo abaixo.
 */
async function loadTeamOverview(userId: string): Promise<TeamOverview | null> {
  const team = await db.query.fantasyTeam.findFirst({
    where: eq(fantasyTeam.userId, userId),
    with: {
      slots: {
        orderBy: (slot, { asc }) => [asc(slot.position)],
        with: { player: true },
      },
    },
  });
  if (!team) return null;

  const activeRound = await getActiveRound();
  // As partidas que trancam o mercado hoje — a regra do dia
  // (`lockedOrganizations`) substituiu a janela da rodada.
  const lockMatches = await listMarketLockMatches();
  const lockedTeams = lockedOrganizations(lockMatches);
  const roster = toRosterSlots(team.slots);
  // A braçadeira dobra a pontuação de quem a usa — única fonte da regra
  // (lib/scoring/team.ts), a mesma que a classificação usa.
  const points = teamPoints(roster);

  return {
    teamId: team.id,
    summary: toTeamSummary(team, activeRound ?? null, points, {
      closesAt: nextMarketClose(lockMatches),
    }),
    roster,
    lockedTeams,
  };
}

/**
 * Visão completa do time do usuário, memoizada por request (`cache()` do
 * React): o layout logado (`app/(app)/layout.tsx`) e a página `/my-team`
 * pedem o mesmo dado no mesmo request e compartilham uma única consulta.
 *
 * O fallback de `ensureFantasyTeam` mora **dentro** da função memoizada de
 * propósito. Se ele ficasse no chamador, a primeira leitura memoizaria o
 * `null` e a releitura depois de criar o time devolveria esse `null` cacheado
 * — o motivo pelo qual as duas telas duplicavam a consulta antes.
 */
export const getTeamOverview = cache(
  async (userId: string, userName: string): Promise<TeamOverview | null> => {
    const overview = await loadTeamOverview(userId);
    if (overview) return overview;

    // Contas criadas antes de o mercado existir não passaram pelo hook de
    // criação do time (databaseHooks.user.create.after em lib/auth.ts).
    // `ensureFantasyTeam` é idempotente, então serve de fallback aqui.
    await ensureFantasyTeam(userId, userName);
    return loadTeamOverview(userId);
  },
);

/**
 * Catálogo do mercado, agrupado por função. Não exclui quem já está
 * escalado — esses candidatos aparecem bloqueados com motivo, e a regra já
 * existe em `evaluateSubstitution` (lib/market/eligibility.ts).
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
): Promise<Record<PlayerRole, Player[]>> {
  const byRole = Object.fromEntries(
    roles.map((role) => [role, [] as Player[]]),
  ) as Record<PlayerRole, Player[]>;
  if (roles.length === 0) return byRole;

  const rows = await db.query.player.findMany({
    where: and(inArray(player.role, roles), eq(player.active, true)),
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

export async function lockTeamForUpdate(tx: Querier, userId: string) {
  const [row] = await tx
    .select()
    .from(fantasyTeam)
    .where(eq(fantasyTeam.userId, userId))
    .for("update");
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
 * Garante o time (e as cinco vagas vazias) de um usuário. Idempotente —
 * chamada tanto por `databaseHooks.user.create.after` (lib/auth.ts), na
 * criação da conta, quanto como fallback em `/my-team` para quem já existia
 * antes de o mercado existir.
 *
 * `seed` é o `@login` do usuário (já único) sempre que disponível — o nome
 * de exibição pode se repetir entre contas. Mesmo assim, o nome derivado
 * pode colidir com um time renomeado por outro usuário: `onConflictDoNothing`
 * só cobre o conflito de `userId` (já ter time), então uma colisão de nome
 * ainda lança a violação de `fantasy_team_name_uidx` — capturada abaixo, com
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
        const [inserted] = await tx
          .insert(fantasyTeam)
          .values({ userId, name })
          .onConflictDoNothing({ target: fantasyTeam.userId })
          .returning({ id: fantasyTeam.id });

        const teamId =
          inserted?.id ??
          (
            await tx.query.fantasyTeam.findFirst({
              where: eq(fantasyTeam.userId, userId),
            })
          )?.id;
        if (!teamId) return;

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
      });
      return;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === MAX_TEAM_NAME_ATTEMPTS) {
        throw error;
      }
      // Colidiu com o nome de outro time — tenta o próximo candidato numerado.
    }
  }
}

/**
 * Já existe um time com esse nome? Compara pela mesma chave do índice
 * `fantasy_team_name_uidx` (`lower(btrim(name))`), então a resposta bate com o
 * que o banco aceitaria.
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
    .select({ id: fantasyTeam.id })
    .from(fantasyTeam)
    .where(sql`lower(btrim(${fantasyTeam.name})) = ${teamNameKey(name)}`)
    .limit(1);
  return row !== undefined;
}

// --- Primitivas do perfil (app/(app)/profile/actions.ts) ---

/**
 * Renomeia o time do próprio usuário. Sem checagem prévia de unicidade — o
 * banco (`fantasy_team_name_uidx`) é a autoridade; quem chama trata
 * `isUniqueViolation`. `where userId` (nunca por `teamId` vindo do cliente).
 */
export async function updateTeamNameForUser(
  tx: Querier,
  userId: string,
  name: string,
): Promise<void> {
  await tx
    .update(fantasyTeam)
    .set({ name })
    .where(eq(fantasyTeam.userId, userId));
}

/** Atualiza as 5 colunas do brasão do time do próprio usuário. */
export async function updateTeamCrestForUser(
  tx: Querier,
  userId: string,
  crest: Crest,
): Promise<void> {
  await tx
    .update(fantasyTeam)
    .set({
      crestShape: crest.shape,
      crestSymbol: crest.symbol,
      crestBg: crest.background,
      crestFg: crest.foreground,
      crestBorder: crest.border,
    })
    .where(eq(fantasyTeam.userId, userId));
}
