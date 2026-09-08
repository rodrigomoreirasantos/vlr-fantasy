import { inArray } from "drizzle-orm";

import { player } from "@/db/schema";
import { organizationLeague } from "@/lib/round/queries";
import { eventRegion, isLeagueRegion } from "@/lib/round/regions";
import type { Querier } from "@/lib/team/queries";

export type MatchRegionSource = {
  event: string;
  /** A bandeira do vlr (`vlr_event.region`) — reforço quando o nome não decide. */
  regionCode: string | null;
  scheduledAt: Date;
};

/**
 * Aplica a partida recém-extraída à região dos jogadores dela — chamada
 * dentro da **mesma transação** de `persistMatchDetail`
 * (`lib/vlr/jobs/scrape-match.ts`), logo após `saveMatchStats`. É o efeito
 * colateral da cascata; a decisão em si é pura (`lib/player/region.ts`).
 *
 * Lê o `regionSourceAt` atual dos candidatos primeiro e filtra em JS — em vez
 * de embutir o guard num `WHERE` — para a regra ficar testável sem depender
 * do Postgres avaliar a condição (CLAUDE.md: banco sempre mockado nos testes).
 */
export async function applyMatchPlayerRegions(
  tx: Querier,
  args: {
    source: MatchRegionSource;
    /** Organização → ids dos jogadores dela nesta partida. */
    playersByOrganization: ReadonlyMap<string, readonly string[]>;
  },
): Promise<{ updated: number }> {
  const region = eventRegion(args.source.event, args.source.regionCode);
  const allPlayerIds = [...args.playersByOrganization.values()].flat();
  if (allPlayerIds.length === 0) return { updated: 0 };

  const currentRows = await tx
    .select({ id: player.id, regionSourceAt: player.regionSourceAt })
    .from(player)
    .where(inArray(player.id, allPlayerIds));
  const sourceAtById = new Map(
    currentRows.map((row) => [row.id, row.regionSourceAt]),
  );

  if (isLeagueRegion(region)) {
    // "A mais recente vence": elegível é quem nunca teve região de liga
    // própria (`null`), ou cuja última fonte é anterior ou igual a esta —
    // `<=` (não `<`) mantém o re-scrape do mesmo HTML idempotente.
    const eligible = allPlayerIds.filter((id) => {
      const sourceAt = sourceAtById.get(id);
      return (
        !sourceAt || sourceAt.getTime() <= args.source.scheduledAt.getTime()
      );
    });
    if (eligible.length === 0) return { updated: 0 };

    await tx
      .update(player)
      .set({ region, regionSourceAt: args.source.scheduledAt })
      .where(inArray(player.id, eligible));
    return { updated: eligible.length };
  }

  // Internacional ou desconhecido: nunca sobrescreve quem já tem região
  // resolvida — só os provisórios (`regionSourceAt` nulo), emprestando a
  // liga da organização (degrau 2 da cascata,
  // `lib/player/region.ts::resolvePlayerRegion`).
  let updated = 0;
  for (const [organization, playerIds] of args.playersByOrganization) {
    const provisional = playerIds.filter((id) => !sourceAtById.get(id));
    if (provisional.length === 0) continue;

    const orgLeague = await organizationLeague(organization, tx);
    if (!orgLeague) continue;

    await tx
      .update(player)
      .set({ region: orgLeague })
      .where(inArray(player.id, provisional));
    updated += provisional.length;
  }
  return { updated };
}
