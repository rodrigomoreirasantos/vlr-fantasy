// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { syncSchedule } from "@/lib/vlr/jobs/sync-schedule";
import { isMain, numberArg, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:schedule", async () => {
    const { matches, rounds, pages } = await syncSchedule({
      pages: numberArg("pages"),
    });
    return {
      ok: true,
      summary: `✓ ${matches} partidas (${pages} páginas), ${rounds} rodadas semanais sincronizadas.`,
    };
  });
}
