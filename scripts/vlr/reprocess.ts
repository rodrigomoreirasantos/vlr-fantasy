// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { db } from "@/db";
import { refreshPlayerForm } from "@/lib/vlr/jobs/calculate-round";
import { reprocessMatch } from "@/lib/vlr/jobs/scrape-match";
import { isMain, runScript, stringArg } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:reprocess", async () => {
    const vlrId = stringArg("match");
    if (!vlrId) {
      throw new Error(
        "Informe a partida: `pnpm vlr:reprocess --match=<vlrId>`.",
      );
    }

    // Reparsa do HTML salvo — **sem rede**. É o que torna barato corrigir um
    // seletor ou mudar uma regra de scout.
    const result = await reprocessMatch(vlrId);

    // `reprocessMatch` só regrava `player_match_stat` — sem isto a forma
    // continuaria refletindo a regra de scout antiga (fato 15, plano 20).
    await db.transaction((tx) => refreshPlayerForm(tx));

    return {
      ok: true,
      summary: `✓ Partida ${vlrId} reprocessada do disco: ${result.mapCount} mapas, ${result.statCount} linhas de estatística.`,
    };
  });
}
