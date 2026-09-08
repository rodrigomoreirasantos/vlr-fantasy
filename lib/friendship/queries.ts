import { and, asc, eq, ne, or } from "drizzle-orm";

import { db } from "@/db";
import { fantasyIdentity, friendship, user } from "@/db/schema";
import { parseCrest } from "@/lib/crest/crest";
import type { CanonicalPair } from "@/lib/friendship/pair";
import type { Friend, IncomingFriendRequest } from "@/lib/friendship/types";
import type { Querier } from "@/lib/team/queries";

type FriendRow = {
  friendshipId: string;
  userId: string;
  userName: string;
  username: string | null;
  teamName: string | null;
  crestShape: string | null;
  crestSymbol: string | null;
  crestBg: string | null;
  crestFg: string | null;
  crestBorder: string | null;
};

function toFriend(row: FriendRow): Friend {
  return {
    friendshipId: row.friendshipId,
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
  };
}

/**
 * Amigos aceitos do usuário, com a identidade (nome + brasão, uma por
 * usuário desde "um time por região" — `.claude/plans/10-time-por-regiao.md`)
 * do outro lado já resolvida. Duas consultas, uma para cada lado do par
 * (`userAId`/`userBId`) — um `JOIN ... ON CASE WHEN` resolveria numa query
 * só, mas exigiria `sql` cru, proibido pelo CLAUDE.md fora de migrations.
 * Concatena e ordena por nome (pt-BR) em JS.
 */
export async function listFriends(userId: string): Promise<Friend[]> {
  const columns = {
    friendshipId: friendship.id,
    userId: user.id,
    userName: user.name,
    username: user.username,
    teamName: fantasyIdentity.name,
    crestShape: fantasyIdentity.crestShape,
    crestSymbol: fantasyIdentity.crestSymbol,
    crestBg: fantasyIdentity.crestBg,
    crestFg: fantasyIdentity.crestFg,
    crestBorder: fantasyIdentity.crestBorder,
  };

  const [asUserA, asUserB] = await Promise.all([
    db
      .select(columns)
      .from(friendship)
      .innerJoin(user, eq(user.id, friendship.userBId))
      .leftJoin(fantasyIdentity, eq(fantasyIdentity.userId, user.id))
      .where(
        and(eq(friendship.userAId, userId), eq(friendship.status, "accepted")),
      ),
    db
      .select(columns)
      .from(friendship)
      .innerJoin(user, eq(user.id, friendship.userAId))
      .leftJoin(fantasyIdentity, eq(fantasyIdentity.userId, user.id))
      .where(
        and(eq(friendship.userBId, userId), eq(friendship.status, "accepted")),
      ),
  ]);

  return [...asUserA, ...asUserB]
    .map(toFriend)
    .sort((a, b) => a.userName.localeCompare(b.userName, "pt-BR"));
}

/** Pedidos de amizade recebidos pelo usuário — `status = "pending"`, enviados por outra pessoa. */
export async function listIncomingFriendRequests(
  userId: string,
): Promise<IncomingFriendRequest[]> {
  return db
    .select({
      friendshipId: friendship.id,
      requesterUserId: user.id,
      requesterUserName: user.name,
      requesterUsername: user.username,
      requestedAt: friendship.requestedAt,
    })
    .from(friendship)
    .innerJoin(user, eq(user.id, friendship.requesterId))
    .where(
      and(
        or(eq(friendship.userAId, userId), eq(friendship.userBId, userId)),
        eq(friendship.status, "pending"),
        ne(friendship.requesterId, userId),
      ),
    )
    .orderBy(asc(friendship.requestedAt));
}

export async function findFriendshipByPair(tx: Querier, pair: CanonicalPair) {
  const row = await tx.query.friendship.findFirst({
    where: and(
      eq(friendship.userAId, pair.userAId),
      eq(friendship.userBId, pair.userBId),
    ),
  });
  return row ?? null;
}

export async function lockFriendshipForUpdate(tx: Querier, id: string) {
  const [row] = await tx
    .select()
    .from(friendship)
    .where(eq(friendship.id, id))
    .for("update");
  return row ?? null;
}

/**
 * Envia (ou reenvia) um pedido: insere `pending`, ou — se já existir um
 * registro `declined` desse par — reaproveita a linha em vez de duplicar.
 * `null` quando já existe um pedido `pending` ou `accepted` (o `setWhere`
 * impede a sobrescrita) — mesmo contrato de `upsertPendingMember`
 * (lib/championship/queries.ts).
 */
export async function upsertFriendRequest(
  tx: Querier,
  args: { pair: CanonicalPair; requesterId: string },
): Promise<{ id: string } | null> {
  const [inserted] = await tx
    .insert(friendship)
    .values({
      userAId: args.pair.userAId,
      userBId: args.pair.userBId,
      requesterId: args.requesterId,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [friendship.userAId, friendship.userBId],
      set: {
        status: "pending",
        requesterId: args.requesterId,
        requestedAt: new Date(),
        respondedAt: null,
      },
      setWhere: eq(friendship.status, "declined"),
    })
    .returning({ id: friendship.id });

  return inserted ?? null;
}

export async function updateFriendshipStatus(
  tx: Querier,
  args: { id: string; status: "accepted" | "declined" },
): Promise<void> {
  await tx
    .update(friendship)
    .set({ status: args.status, respondedAt: new Date() })
    .where(eq(friendship.id, args.id));
}

export async function deleteFriendship(tx: Querier, id: string): Promise<void> {
  await tx.delete(friendship).where(eq(friendship.id, id));
}

/**
 * Auto-amizade: cria o vínculo já `accepted` quando um convite de
 * campeonato é aceito. `onConflictDoNothing` — não `DoUpdate` — porque um
 * vínculo já existente (inclusive um `declined` deliberado) nunca deve ser
 * sobrescrito por um efeito colateral de campeonato.
 */
export async function ensureFriendship(
  tx: Querier,
  pair: CanonicalPair,
): Promise<void> {
  await tx
    .insert(friendship)
    .values({
      userAId: pair.userAId,
      userBId: pair.userBId,
      requesterId: pair.userAId,
      status: "accepted",
      respondedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [friendship.userAId, friendship.userBId],
    });
}
