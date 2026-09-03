// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

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
    return {
      ok: true,
      summary: `✓ Partida ${vlrId} reprocessada do disco: ${result.mapCount} mapas, ${result.statCount} linhas de estatística.`,
    };
  });
}
