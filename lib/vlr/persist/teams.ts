import { sql } from "drizzle-orm";

import { vlrTeam } from "@/db/schema";
import type { Querier } from "@/lib/team/queries";

export type UpsertableTeam = {
  vlrId: string;
  name: string;
  tag?: string | null;
  region?: string | null;
  logoUrl?: string | null;
};

/**
 * Upsert de organizações por `vlrId`. `vlr_team` é a fonte canônica do nome
 * que `player.team` e `match.teamA`/`teamB` carregam — é o que torna o
 * cruzamento por igualdade de texto confiável.
 */
export async function upsertTeams(
  tx: Querier,
  teams: readonly UpsertableTeam[],
): Promise<Map<string, string>> {
  if (teams.length === 0) return new Map();

  // Uma mesma partida traz o time duas vezes (uma por mapa): sem deduplicar,
  // o Postgres recusa o comando inteiro com "cannot affect row a second time".
  const unique = new Map<string, UpsertableTeam>();
  for (const team of teams) unique.set(team.vlrId, team);

  const rows = await tx
    .insert(vlrTeam)
    .values(
      [...unique.values()].map((team) => ({
        vlrId: team.vlrId,
        name: team.name,
        tag: team.tag ?? null,
        region: team.region ?? null,
        logoUrl: team.logoUrl ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: vlrTeam.vlrId,
      set: {
        name: sql`excluded.name`,
        // `coalesce`: o scoreboard traz a sigla, a lista não. Um upsert vindo
        // da lista não pode apagar o que o scoreboard já tinha preenchido.
        tag: sql`coalesce(excluded.tag, ${vlrTeam.tag})`,
        region: sql`coalesce(excluded.region, ${vlrTeam.region})`,
        logoUrl: sql`coalesce(excluded.logo_url, ${vlrTeam.logoUrl})`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: vlrTeam.id, vlrId: vlrTeam.vlrId });

  return new Map(rows.map((row) => [row.vlrId, row.id]));
}
