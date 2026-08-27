import { and, asc, count, eq, inArray, sum } from "drizzle-orm";

import { db } from "@/db";
import {
  championship,
  championshipMember,
  fantasyTeam,
  player,
  rosterSlot,
  user,
} from "@/db/schema";
import type {
  ChampionshipSummary,
  PendingInvite,
  PendingMember,
  StandingRow,
} from "@/lib/championship/types";
import type { Querier } from "@/lib/team/queries";

/**
 * Campeonatos em que o usuário é membro aceito, com a contagem de membros
 * aceitos de cada um. Ordenado por nome.
 */
export async function listUserChampionships(
  userId: string,
): Promise<ChampionshipSummary[]> {
  const memberships = await db
    .select({
      id: championship.id,
      name: championship.name,
      ownerId: championship.ownerId,
    })
    .from(championshipMember)
    .innerJoin(
      championship,
      eq(championship.id, championshipMember.championshipId),
    )
    .where(
      and(
        eq(championshipMember.userId, userId),
        eq(championshipMember.status, "accepted"),
      ),
    )
    .orderBy(asc(championship.name));

  if (memberships.length === 0) return [];

  const counts = await db
    .select({
      championshipId: championshipMember.championshipId,
      memberCount: count(),
    })
    .from(championshipMember)
    .where(
      and(
        inArray(
          championshipMember.championshipId,
          memberships.map((m) => m.id),
        ),
        eq(championshipMember.status, "accepted"),
      ),
    )
    .groupBy(championshipMember.championshipId);

  const countByChampionship = new Map(
    counts.map((c) => [c.championshipId, c.memberCount]),
  );

  return memberships.map((m) => ({
    ...m,
    memberCount: countByChampionship.get(m.id) ?? 0,
  }));
}

export async function getChampionship(championshipId: string, q: Querier = db) {
  const row = await q.query.championship.findFirst({
    where: eq(championship.id, championshipId),
  });
  return row ?? null;
}

/**
 * Uma linha por membro aceito do campeonato, com a soma da pontuação atual
 * do elenco (`player.score` das 5 vagas). Sem ordenação — a classificação é
 * responsabilidade de `rankStandings` (standings.ts). Os `leftJoin` garantem
 * que um membro sem time ou com elenco vazio apareça com 0 pontos, nunca
 * suma da lista.
 */
export async function getStandingRows(
  championshipId: string,
): Promise<StandingRow[]> {
  const rows = await db
    .select({
      userId: user.id,
      userName: user.name,
      username: user.username,
      teamName: fantasyTeam.name,
      points: sum(player.score),
    })
    .from(championshipMember)
    .innerJoin(user, eq(user.id, championshipMember.userId))
    .leftJoin(fantasyTeam, eq(fantasyTeam.userId, user.id))
    .leftJoin(rosterSlot, eq(rosterSlot.fantasyTeamId, fantasyTeam.id))
    .leftJoin(player, eq(player.id, rosterSlot.playerId))
    .where(
      and(
        eq(championshipMember.championshipId, championshipId),
        eq(championshipMember.status, "accepted"),
      ),
    )
    .groupBy(
      user.id,
      user.name,
      user.username,
      fantasyTeam.id,
      fantasyTeam.name,
    );

  return rows.map((row) => ({
    userId: row.userId,
    userName: row.userName,
    username: row.username,
    teamName: row.teamName ?? "Sem time",
    points: Number(row.points ?? 0),
  }));
}

/** Convites recebidos pelo usuário, ainda pendentes. */
export async function listPendingInvites(
  userId: string,
): Promise<PendingInvite[]> {
  const rows = await db
    .select({
      memberId: championshipMember.id,
      championshipId: championship.id,
      championshipName: championship.name,
      invitedByUsername: user.username,
      invitedAt: championshipMember.invitedAt,
    })
    .from(championshipMember)
    .innerJoin(
      championship,
      eq(championship.id, championshipMember.championshipId),
    )
    .leftJoin(user, eq(user.id, championshipMember.invitedById))
    .where(
      and(
        eq(championshipMember.userId, userId),
        eq(championshipMember.status, "pending"),
      ),
    )
    .orderBy(asc(championshipMember.invitedAt));

  return rows;
}

/** Convites enviados por um campeonato, ainda pendentes — visível só ao dono. */
export async function listPendingMembers(
  championshipId: string,
): Promise<PendingMember[]> {
  return db
    .select({
      memberId: championshipMember.id,
      userName: user.name,
      username: user.username,
    })
    .from(championshipMember)
    .innerJoin(user, eq(user.id, championshipMember.userId))
    .where(
      and(
        eq(championshipMember.championshipId, championshipId),
        eq(championshipMember.status, "pending"),
      ),
    )
    .orderBy(asc(user.name));
}

export async function findUserByUsername(tx: Querier, username: string) {
  const row = await tx.query.user.findFirst({
    where: eq(user.username, username),
  });
  return row ?? null;
}

export async function lockMembershipForUpdate(tx: Querier, memberId: string) {
  const [row] = await tx
    .select()
    .from(championshipMember)
    .where(eq(championshipMember.id, memberId))
    .for("update");
  return row ?? null;
}

// --- Primitivas de escrita usadas dentro da `db.transaction` das Server
// Actions (app/(app)/ranking/actions.ts) — nunca se monta `tx.insert(...)`
// direto na action, para os testes poderem mockar cada uma individualmente.

/**
 * Cria o campeonato e já entra o criador como membro aceito — sem isso,
 * quem cria um campeonato não apareceria na própria classificação.
 */
export async function insertChampionshipWithOwner(
  tx: Querier,
  args: { name: string; ownerId: string },
): Promise<string> {
  const [created] = await tx
    .insert(championship)
    .values({ name: args.name, ownerId: args.ownerId })
    .returning({ id: championship.id });

  await tx.insert(championshipMember).values({
    championshipId: created.id,
    userId: args.ownerId,
    status: "accepted",
    respondedAt: new Date(),
  });

  return created.id;
}

/**
 * Convida (ou reconvida) um usuário: insere o membro como `pending`, ou —
 * se já existir um registro `declined` desse par campeonato/usuário —
 * reaproveita a linha em vez de duplicar. `null` quando já existe um
 * convite `pending` ou `accepted` (o `setWhere` impede a sobrescrita).
 */
export async function upsertPendingMember(
  tx: Querier,
  args: { championshipId: string; userId: string; invitedById: string },
): Promise<{ id: string } | null> {
  const [inserted] = await tx
    .insert(championshipMember)
    .values({
      championshipId: args.championshipId,
      userId: args.userId,
      status: "pending",
      invitedById: args.invitedById,
    })
    .onConflictDoUpdate({
      target: [championshipMember.championshipId, championshipMember.userId],
      set: {
        status: "pending",
        invitedById: args.invitedById,
        invitedAt: new Date(),
        respondedAt: null,
      },
      setWhere: eq(championshipMember.status, "declined"),
    })
    .returning({ id: championshipMember.id });

  return inserted ?? null;
}

/** O registro de membro (de qualquer status) de um par campeonato/usuário. */
export async function findMembership(
  tx: Querier,
  args: { championshipId: string; userId: string },
) {
  const row = await tx.query.championshipMember.findFirst({
    where: and(
      eq(championshipMember.championshipId, args.championshipId),
      eq(championshipMember.userId, args.userId),
    ),
  });
  return row ?? null;
}

export async function updateMembershipStatus(
  tx: Querier,
  args: { memberId: string; status: "accepted" | "declined" },
): Promise<void> {
  await tx
    .update(championshipMember)
    .set({ status: args.status, respondedAt: new Date() })
    .where(eq(championshipMember.id, args.memberId));
}
