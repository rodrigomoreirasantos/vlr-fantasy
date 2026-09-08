import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { player } from "@/db/schema";
import {
  organizationRegions,
  resolvePlayerRegion,
  type RegionalAppearance,
} from "@/lib/player/region";
import {
  listOrganizationMatches,
  listPlayerLeagueAppearances,
} from "@/lib/round/queries";
import {
  eventRegion,
  isLeagueRegion,
  PLAYER_REGIONS,
  type PlayerRegion,
} from "@/lib/round/regions";
import { logInfo } from "@/lib/vlr/http/log";

export type SyncPlayerRegionsResult = {
  players: number;
  updated: number;
  byRegion: Record<PlayerRegion, number>;
};

/**
 * Recalcula a região de **todo** jogador do catálogo do zero, ignorando o
 * estado atual — idempotente por construção, ao contrário de
 * `applyMatchPlayerRegions` (que só reage a uma partida por vez, dentro do
 * scrape). É o que `pnpm vlr:regions` roda, e o que `backfill()` chama no fim
 * da carga histórica.
 */
export async function syncPlayerRegions(): Promise<SyncPlayerRegionsResult> {
  const [appearances, orgMatchRows, players] = await Promise.all([
    listPlayerLeagueAppearances(),
    listOrganizationMatches(),
    db
      .select({
        id: player.id,
        team: player.team,
        region: player.region,
        regionSourceAt: player.regionSourceAt,
      })
      .from(player),
  ]);

  const orgMatches = orgMatchRows.flatMap((row) => {
    const region = eventRegion(row.event, row.regionCode);
    return isLeagueRegion(region)
      ? [{ teamA: row.teamA, teamB: row.teamB, region, at: row.scheduledAt }]
      : [];
  });
  const orgRegions = organizationRegions(orgMatches);

  const appearancesByPlayer = new Map<string, RegionalAppearance[]>();
  for (const appearance of appearances) {
    const list = appearancesByPlayer.get(appearance.playerId) ?? [];
    list.push({ region: appearance.region, at: appearance.at });
    appearancesByPlayer.set(appearance.playerId, list);
  }

  const byRegion = Object.fromEntries(
    PLAYER_REGIONS.map((region) => [region, 0]),
  ) as Record<PlayerRegion, number>;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const row of players) {
      const resolved = resolvePlayerRegion({
        own: appearancesByPlayer.get(row.id) ?? [],
        organization: orgRegions.get(row.team) ?? null,
      });
      byRegion[resolved.region] += 1;

      const sourceChanged =
        (resolved.sourceAt?.getTime() ?? null) !==
        (row.regionSourceAt?.getTime() ?? null);
      if (resolved.region === row.region && !sourceChanged) continue;

      await tx
        .update(player)
        .set({ region: resolved.region, regionSourceAt: resolved.sourceAt })
        .where(eq(player.id, row.id));
      updated += 1;
    }
  });

  const result = { players: players.length, updated, byRegion };
  logInfo("vlr.regions.synced", result);
  return result;
}

/**
 * Quantos jogadores `active` estão em `"other"` — invisíveis nas 5 abas de
 * escalação. `runDoctor` reporta este número; um catálogo saudável tende a
 * zero conforme o scrap acumula histórico.
 */
export async function countPlayersOutOfRegion(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(player)
    .where(and(eq(player.region, "other"), eq(player.active, true)));
  return row?.count ?? 0;
}
