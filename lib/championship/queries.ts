import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  championship,
  championshipMember,
  fantasyIdentity,
  fantasyTeam,
  player,
  roundTeamResult,
  rosterSlot,
  user,
} from "@/db/schema";
import { parseCrest } from "@/lib/crest/crest";
import type {
  ChampionshipSummary,
  PendingInvite,
  PendingMember,
  StandingRow,
} from "@/lib/championship/types";
import { toTeamRegion, type TeamRegion } from "@/lib/round/regions";
import { CAPTAIN_MULTIPLIER } from "@/lib/scoring/team";
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
      region: championship.region,
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
    region: toTeamRegion(m.region),
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
 * Uma linha por membro aceito, por campeonato pedido, com a soma da
 * pontuação atual do elenco (`player.score` das 5 vagas). Sem ordenação — a
 * classificação é responsabilidade de `rankStandings` (standings.ts). Os
 * `leftJoin` garantem que um membro sem time ou com elenco vazio apareça com
 * 0 pontos, nunca suma da lista.
 *
 * Resolve **todos** os campeonatos pedidos numa única consulta — usada pelo
 * perfil para extrair a colocação do usuário em cada campeonato sem repetir
 * a query por campeonato. `getStandingRows` (abaixo) é o caso particular de
 * um só campeonato, usado por `/ranking`.
 */
export async function getStandingRowsByChampionship(
  championshipIds: readonly string[],
): Promise<Map<string, StandingRow[]>> {
  const byChampionship = new Map<string, StandingRow[]>(
    championshipIds.map((id) => [id, []]),
  );
  if (championshipIds.length === 0) return byChampionship;

  const rows = await db
    .select({
      championshipId: championshipMember.championshipId,
      userId: user.id,
      userName: user.name,
      username: user.username,
      teamName: fantasyIdentity.name,
      crestShape: fantasyIdentity.crestShape,
      crestSymbol: fantasyIdentity.crestSymbol,
      crestBg: fantasyIdentity.crestBg,
      crestFg: fantasyIdentity.crestFg,
      crestBorder: fantasyIdentity.crestBorder,
      // A braçadeira dobra a pontuação de quem a usa — mesma regra de
      // `teamPoints` (lib/scoring/team.ts), interpolada aqui porque o `sum`
      // roda no banco, sobre as 5 vagas de cada membro de uma vez.
      points: sql<string | null>`sum(case when ${rosterSlot.captain}
        then ${player.score} * ${CAPTAIN_MULTIPLIER} else ${player.score} end)`,
    })
    .from(championshipMember)
    .innerJoin(
      championship,
      eq(championship.id, championshipMember.championshipId),
    )
    .innerJoin(user, eq(user.id, championshipMember.userId))
    .leftJoin(fantasyIdentity, eq(fantasyIdentity.userId, user.id))
    // O time **da região do campeonato** — sem este predicado, cada membro
    // com 5 times viraria 5 linhas e o `sum` somaria os 5 elencos.
    .leftJoin(
      fantasyTeam,
      and(
        eq(fantasyTeam.userId, user.id),
        eq(fantasyTeam.region, championship.region),
      ),
    )
    .leftJoin(rosterSlot, eq(rosterSlot.fantasyTeamId, fantasyTeam.id))
    .leftJoin(player, eq(player.id, rosterSlot.playerId))
    .where(
      and(
        inArray(championshipMember.championshipId, championshipIds),
        eq(championshipMember.status, "accepted"),
      ),
    )
    .groupBy(
      championshipMember.championshipId,
      user.id,
      user.name,
      user.username,
      fantasyIdentity.userId,
      fantasyIdentity.name,
      fantasyIdentity.crestShape,
      fantasyIdentity.crestSymbol,
      fantasyIdentity.crestBg,
      fantasyIdentity.crestFg,
      fantasyIdentity.crestBorder,
    );

  for (const row of rows) {
    const standing: StandingRow = {
      userId: row.userId,
      userName: row.userName,
      username: row.username,
      teamName: row.teamName ?? "Sem time",
      crest: parseCrest({
        shape: row.crestShape ?? "",
        symbol: row.crestSymbol ?? "",
        background: row.crestBg ?? "",
        foreground: row.crestFg ?? "",
        border: row.crestBorder ?? "",
      }),
      points: Number(row.points ?? 0),
    };
    byChampionship.get(row.championshipId)?.push(standing);
  }

  return byChampionship;
}

/**
 * Irmã de `getStandingRowsByChampionship`: mesma forma (`StandingRow`), mas
 * lendo a pontuação **congelada** de uma rodada (`round_team_result`) em vez
 * do elenco ao vivo — é exatamente o cenário que
 * `lib/championship/standings.ts:6-8` já antecipava ("se a base de pontuação
 * mudar no futuro, só a query muda"). `rankStandings` funciona sobre o
 * resultado sem nenhuma alteração. Sem `groupBy`: `round_team_result` já tem
 * uma linha por time por rodada, então não há agregação a fazer aqui — só o
 * `leftJoin`, para um membro sem time (ou sem resultado naquela rodada,
 * porque criou o time depois dela) aparecer com 0 pontos, nunca sumir.
 */
export async function getStandingRowsForRoundByChampionship(
  championshipIds: readonly string[],
  roundId: string,
): Promise<Map<string, StandingRow[]>> {
  const byChampionship = new Map<string, StandingRow[]>(
    championshipIds.map((id) => [id, []]),
  );
  if (championshipIds.length === 0) return byChampionship;

  const rows = await db
    .select({
      championshipId: championshipMember.championshipId,
      userId: user.id,
      userName: user.name,
      username: user.username,
      teamName: fantasyIdentity.name,
      crestShape: fantasyIdentity.crestShape,
      crestSymbol: fantasyIdentity.crestSymbol,
      crestBg: fantasyIdentity.crestBg,
      crestFg: fantasyIdentity.crestFg,
      crestBorder: fantasyIdentity.crestBorder,
      points: roundTeamResult.points,
    })
    .from(championshipMember)
    .innerJoin(
      championship,
      eq(championship.id, championshipMember.championshipId),
    )
    .innerJoin(user, eq(user.id, championshipMember.userId))
    .leftJoin(fantasyIdentity, eq(fantasyIdentity.userId, user.id))
    // O time **da região do campeonato** — mesmo predicado de
    // `getStandingRowsByChampionship`, para o `roundTeamResult` pendurar no
    // time certo, não num dos outros 4.
    .leftJoin(
      fantasyTeam,
      and(
        eq(fantasyTeam.userId, user.id),
        eq(fantasyTeam.region, championship.region),
      ),
    )
    .leftJoin(
      roundTeamResult,
      and(
        eq(roundTeamResult.fantasyTeamId, fantasyTeam.id),
        eq(roundTeamResult.roundId, roundId),
      ),
    )
    .where(
      and(
        inArray(championshipMember.championshipId, championshipIds),
        eq(championshipMember.status, "accepted"),
      ),
    );

  for (const row of rows) {
    const standing: StandingRow = {
      userId: row.userId,
      userName: row.userName,
      username: row.username,
      teamName: row.teamName ?? "Sem time",
      crest: parseCrest({
        shape: row.crestShape ?? "",
        symbol: row.crestSymbol ?? "",
        background: row.crestBg ?? "",
        foreground: row.crestFg ?? "",
        border: row.crestBorder ?? "",
      }),
      points: row.points ?? 0,
    };
    byChampionship.get(row.championshipId)?.push(standing);
  }

  return byChampionship;
}

/** Classificação de um único campeonato — caso particular de `getStandingRowsByChampionship`. */
export async function getStandingRows(
  championshipId: string,
): Promise<StandingRow[]> {
  const byChampionship = await getStandingRowsByChampionship([championshipId]);
  return byChampionship.get(championshipId) ?? [];
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
  args: { name: string; ownerId: string; region: TeamRegion },
): Promise<string> {
  const [created] = await tx
    .insert(championship)
    .values({ name: args.name, ownerId: args.ownerId, region: args.region })
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

export type InviteBlockReason =
  "not_owner" | "self" | "already_member" | "already_invited";

/**
 * Convida um usuário já resolvido (`targetUserId`) para um campeonato. É a
 * segunda metade de `inviteMember` (app/(app)/ranking/actions.ts) — achar o
 * usuário pelo login é responsabilidade de quem chama, com
 * `findUserByUsername` — extraída para o perfil reaproveitar sem duplicar a
 * regra de bloqueio. Devolve um resultado, **não lança** — no estilo de
 * `evaluateSubstitution` (lib/market/eligibility.ts); quem traduz é
 * `inviteBlockMessage` (format.ts).
 */
export async function inviteUserToChampionship(
  tx: Querier,
  args: { championshipId: string; ownerId: string; targetUserId: string },
): Promise<{ ok: true } | { ok: false; reason: InviteBlockReason }> {
  const targetChampionship = await getChampionship(args.championshipId, tx);
  if (!targetChampionship || targetChampionship.ownerId !== args.ownerId) {
    return { ok: false, reason: "not_owner" };
  }
  if (args.targetUserId === args.ownerId) {
    return { ok: false, reason: "self" };
  }

  const inserted = await upsertPendingMember(tx, {
    championshipId: args.championshipId,
    userId: args.targetUserId,
    invitedById: args.ownerId,
  });
  if (inserted) return { ok: true };

  const existing = await findMembership(tx, {
    championshipId: args.championshipId,
    userId: args.targetUserId,
  });
  return {
    ok: false,
    reason:
      existing?.status === "accepted" ? "already_member" : "already_invited",
  };
}
