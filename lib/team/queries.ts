import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { fantasyTeam, player, round, rosterSlot, transfer } from "@/db/schema";
import { toDomainPlayer, toRosterSlots, toTeamSummary } from "@/lib/team/mappers";
import type { PlayerRole, RosterSlot, TeamSummary, Player } from "@/lib/team/types";

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
 * Visão completa do time do usuário: resumo (saldo, mercado, pontos) e as
 * cinco vagas da escalação. `null` quando o usuário ainda não tem time —
 * cabe à página chamar `ensureFantasyTeam` e tentar de novo.
 */
export async function getTeamOverview(userId: string): Promise<TeamOverview | null> {
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
  const points = roster.reduce((total, slot) => total + (slot.player?.score ?? 0), 0);

  return {
    teamId: team.id,
    summary: toTeamSummary(team, activeRound ?? null, points),
    roster,
  };
}

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
  const byRole = Object.fromEntries(roles.map((role) => [role, [] as Player[]])) as Record<
    PlayerRole,
    Player[]
  >;
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

export async function lockSlotForUpdate(tx: Querier, teamId: string, slotId: string) {
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

export async function loadRosteredPlayerIds(tx: Querier, teamId: string): Promise<string[]> {
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
 * Garante o time (e as cinco vagas vazias) de um usuário. Idempotente —
 * chamada tanto por `databaseHooks.user.create.after` (lib/auth.ts), na
 * criação da conta, quanto como fallback em `/my-team` para quem já existia
 * antes de o mercado existir.
 */
export async function ensureFantasyTeam(userId: string, userName: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(fantasyTeam)
      .values({ userId, name: deriveTeamName(userName) })
      .onConflictDoNothing({ target: fantasyTeam.userId })
      .returning({ id: fantasyTeam.id });

    const teamId =
      inserted?.id ??
      (await tx.query.fantasyTeam.findFirst({ where: eq(fantasyTeam.userId, userId) }))?.id;
    if (!teamId) return;

    await tx
      .insert(rosterSlot)
      .values(
        Array.from({ length: ROSTER_SIZE }, (_, index) => ({
          fantasyTeamId: teamId,
          position: index + 1,
        })),
      )
      .onConflictDoNothing({ target: [rosterSlot.fantasyTeamId, rosterSlot.position] });
  });
}
