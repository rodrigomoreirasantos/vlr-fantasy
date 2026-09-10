import { eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { player } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";
import { logWarn } from "@/lib/vlr/http/log";
import { inSavepoint } from "@/lib/vlr/persist/players";
import { upsertTeams } from "@/lib/vlr/persist/teams";
import type { ScrapedTeamRoster } from "@/lib/vlr/schemas";

export type ApplyRosterResult = {
  updated: number;
  unknown: number;
  left: number;
};

/**
 * O elenco atual de uma organização → `player.team`/`nickname`/`realName`/
 * `country` — a transferência sem esperar o jogador entrar em quadra
 * (Decisão 4, plano 17).
 *
 * **Nunca cria jogador.** Quem está no elenco mas não tem linha em `player`
 * é ignorado (`unknown`, com aviso): a Decisão 4 é clara — estreante entra
 * quando jogar (`resolvePlayer`), não antes, porque nasceria sem histórico e
 * sem preço.
 *
 * **Nunca desativa nem tira do mercado quem saiu.** Só sinaliza
 * `rosterMissingSince` (`left`): o jogador pode estar escalado no time de
 * alguém agora mesmo, e sumir do catálogo no meio da rodada por uma
 * informação que ainda pode ser erro do vlr seria destrutivo.
 */
export async function applyRoster(
  tx: Querier,
  roster: ScrapedTeamRoster,
): Promise<ApplyRosterResult> {
  await upsertTeams(tx, [
    {
      vlrId: roster.vlrId,
      name: roster.name,
      tag: roster.tag,
      region: roster.region,
    },
  ]);

  const seenVlrIds = new Set<string>();
  let updated = 0;
  let unknown = 0;

  for (const item of roster.players) {
    seenVlrIds.add(item.vlrId);

    const existing = await tx.query.player.findFirst({
      where: eq(player.vlrId, item.vlrId),
    });
    if (!existing) {
      logWarn("vlr.roster.unknown_player", {
        teamVlrId: roster.vlrId,
        team: roster.name,
        playerVlrId: item.vlrId,
        nickname: item.nickname,
      });
      unknown += 1;
      continue;
    }

    // Mesmo savepoint de `resolvePlayer`: um jogador que troca de nick para
    // um nick já ocupado não pode derrubar o lote inteiro do time.
    const renamed =
      existing.nickname === item.nickname ||
      (await inSavepoint(tx, (sp) =>
        sp
          .update(player)
          .set({ nickname: item.nickname })
          .where(eq(player.id, existing.id)),
      ));
    if (!renamed) {
      logWarn("vlr.player.rename_collision", {
        vlrId: item.vlrId,
        from: existing.nickname,
        to: item.nickname,
      });
    }

    await tx
      .update(player)
      .set({
        team: roster.name,
        realName: item.realName ?? existing.realName,
        country: item.country ?? existing.country,
        rosterMissingSince: null,
      })
      .where(eq(player.id, existing.id));
    updated += 1;
  }

  // Quem tinha esta organização e não veio no elenco de agora — sinaliza uma
  // vez (idempotente: não reescreve quem já está sinalizado).
  const currentSquad = await tx.query.player.findMany({
    where: eq(player.team, roster.name),
  });
  let left = 0;
  for (const row of currentSquad) {
    if (row.vlrId !== null && seenVlrIds.has(row.vlrId)) continue;
    if (row.rosterMissingSince !== null) continue;

    await tx
      .update(player)
      .set({ rosterMissingSince: new Date() })
      .where(eq(player.id, row.id));
    left += 1;
  }

  return { updated, unknown, left };
}

/** Jogadores sinalizados como fora do elenco (Decisão 4, plano 17) — o número que o `doctor` denuncia. */
export async function countRosterMissing(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(player)
    .where(isNotNull(player.rosterMissingSince));
  return row?.count ?? 0;
}
