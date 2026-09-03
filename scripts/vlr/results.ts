// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { syncResults } from "@/lib/vlr/jobs/sync-results";
import { isMain, numberArg, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:results", async () => {
    const { matches, enqueued, pages } = await syncResults({
      pages: numberArg("pages") ?? 1,
    });
    return {
      ok: true,
      summary: `✓ ${matches} resultados lidos em ${pages} página(s); ${enqueued} partidas enfileiradas para extração.`,
    };
  });
}
