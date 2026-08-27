import { and, eq, inArray } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { fantasyTeam, player, round, rosterSlot, transfer } from "@/db/schema";
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

export type TeamOverview = {
  teamId: string;
  summary: TeamSummary;
  roster: RosterSlot[];
};

/** Nome do time derivado do nome do usuário, usado na criação (hook de auth e fallback). */
export function deriveTeamName(userName: string): string {
  return `${userName} FC`;
}

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
  const roster = toRosterSlots(team.slots);
  const points = roster.reduce(
    (total, slot) => total + (slot.player?.score ?? 0),
    0,
  );

  return {
    teamId: team.id,
    summary: toTeamSummary(team, activeRound ?? null, points),
    roster,
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
    orderBy: (row, { desc, asc }) => [desc(row.score), asc(row.nickname)],
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
 */
export async function ensureFantasyTeam(
  userId: string,
  userName: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(fantasyTeam)
      .values({ userId, name: deriveTeamName(userName) })
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
}
