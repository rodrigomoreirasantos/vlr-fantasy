import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { player } from "@/db/schema";
import { logInfo, logWarn } from "@/lib/vlr/http/log";
import { refreshPlayerAggregates } from "@/lib/vlr/jobs/calculate-round";
import { syncPlayerRegions } from "@/lib/vlr/jobs/sync-player-regions";
import { syncResults } from "@/lib/vlr/jobs/sync-results";
import { workQueue } from "@/lib/vlr/jobs/work";

/**
 * Carga histórica: percorre `/matches/results`, enfileira as partidas de
 * eventos `tracked`, consome a fila e recalcula os agregados do catálogo.
 *
 * **Idempotente por construção** — cada camada já é: `upsertMatches` casa por
 * `vlrId`, `saveMatchStats` pela tripla `(partida, jogador, mapa)`,
 * `resolvePlayer` pelo `vlrId`, e a regra de cache impede rebuscar o que já
 * tem `scrapedAt`. Rodar duas vezes seguidas tem de dar contagens idênticas
 * em `player`, `match` e `player_match_stat`.
 */
export async function backfill(options: { pages?: number } = {}): Promise<{
  pages: number;
  enqueued: number;
  done: number;
  failed: number;
  needsReview: number;
}> {
  const pages = options.pages ?? 5;

  // `stopAfterKnown` alto: no backfill queremos varrer as páginas todas, não
  // parar na primeira que já conhecemos.
  const results = await syncResults({ pages, stopAfterKnown: pages + 1 });
  const work = await workQueue({ limit: results.enqueued });

  const aggregates = await db.transaction((tx) => refreshPlayerAggregates(tx));
  // Depois dos agregados: o catálogo inteiro tem partida extraída agora, e
  // esta é a chance de resolver a região de todo mundo de uma vez —
  // `.claude/plans/10-time-por-regiao.md`.
  await syncPlayerRegions();
  const needsReview = await countNeedsReview();

  if (needsReview > 0) {
    // Nascer fora do mercado é deliberado: jogador não revisado não entra no
    // catálogo. Revisar é conferir a função e ligar `active`.
    logWarn("vlr.backfill.needs_review", {
      players: needsReview,
      hint: "Confira a função em db:studio e marque `active` para liberar no mercado.",
    });
  }

  logInfo("vlr.backfill.finished", {
    pages: results.pages,
    enqueued: results.enqueued,
    done: work.done,
    failed: work.failed,
    players: aggregates.players,
    needsReview,
  });

  return {
    pages: results.pages,
    enqueued: results.enqueued,
    done: work.done,
    failed: work.failed,
    needsReview,
  };
}

export async function countNeedsReview(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(player)
    .where(eq(player.needsReview, true));
  return row?.count ?? 0;
}
