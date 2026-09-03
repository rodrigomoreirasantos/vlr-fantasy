import { eq, sql } from "drizzle-orm";

import { match, playerMatchStat } from "@/db/schema";
import type { MatchStatus } from "@/lib/round/types";
import type { Transaction } from "@/lib/team/queries";

export type MatchStatRow = {
  playerId: string;
  mapName: string;
  /** Id do mapa no vlr — a chave natural da linha, nunca nula. */
  gameVlrId: string;
  agent: string | null;
  rating: number | null;
  acs: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kast: number | null;
  adr: number | null;
  headshotPct: number | null;
  firstKills: number | null;
  firstDeaths: number | null;
  won: boolean;
  fantasyPoints: number;
  scoutVersion: number;
};

export type SaveMatchStatsArgs = {
  matchId: string;
  rows: readonly MatchStatRow[];
  rawHtmlPath: string | null;
  scrapedAt: Date;
  scoreA: number | null;
  scoreB: number | null;
  bestOf: number | null;
  status: MatchStatus;
};

/**
 * Grava as linhas por mapa **e** marca a partida como extraída, na mesma
 * transação. Separar as duas coisas abriria a janela em que a partida conta
 * como extraída sem ter estatística nenhuma — e a regra de cache permanente
 * (`scrapedAt IS NOT NULL` nunca é reenfileirada) transformaria essa janela
 * num buraco definitivo.
 *
 * `Transaction`, não `Querier`: o CLAUDE.md exige transação para tudo que
 * mexe em pontuação, e tipar assim torna `saveMatchStats(db, …)` impossível.
 */
export async function saveMatchStats(
  tx: Transaction,
  args: SaveMatchStatsArgs,
): Promise<void> {
  if (args.rows.length > 0) {
    await tx
      .insert(playerMatchStat)
      .values(args.rows.map((row) => ({ ...row, matchId: args.matchId })))
      .onConflictDoUpdate({
        // A tripla (partida, jogador, mapa): reprocessar o mesmo HTML
        // atualiza as mesmas linhas, nunca duplica.
        // A tripla usa `gameVlrId` — o id do mapa no vlr —, não o **nome** do
        // mapa: uma série pode trazer o mesmo nome duas vezes (mapa anulado,
        // "TBD" numa Bo5 incompleta), e aí o `ON CONFLICT DO UPDATE` estoura
        // com "cannot affect row a second time", derrubando a transação.
        target: [
          playerMatchStat.matchId,
          playerMatchStat.playerId,
          playerMatchStat.gameVlrId,
        ],
        set: {
          mapName: sql`excluded.map_name`,
          agent: sql`excluded.agent`,
          rating: sql`excluded.rating`,
          acs: sql`excluded.acs`,
          kills: sql`excluded.kills`,
          deaths: sql`excluded.deaths`,
          assists: sql`excluded.assists`,
          kast: sql`excluded.kast`,
          adr: sql`excluded.adr`,
          headshotPct: sql`excluded.headshot_pct`,
          firstKills: sql`excluded.first_kills`,
          firstDeaths: sql`excluded.first_deaths`,
          won: sql`excluded.won`,
          fantasyPoints: sql`excluded.fantasy_points`,
          scoutVersion: sql`excluded.scout_version`,
          updatedAt: new Date(),
        },
      });
  }

  // **`scrapedAt` só para partida encerrada.** A regra de cache permanente é
  // `WHERE scraped_at IS NULL`: marcar uma série ainda em andamento a
  // congelaria com o scoreboard pela metade, para sempre — e nem o
  // `vlr:reprocess` salvaria, porque ele reparsa o mesmo HTML parcial.
  const finished = args.status === "finished";

  await tx
    .update(match)
    .set({
      scrapedAt: finished ? args.scrapedAt : null,
      rawHtmlPath: args.rawHtmlPath,
      status: args.status,
      scoreA: args.scoreA,
      scoreB: args.scoreB,
      bestOf: args.bestOf,
    })
    .where(eq(match.id, args.matchId));
}
