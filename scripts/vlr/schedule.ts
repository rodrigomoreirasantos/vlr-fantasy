// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { syncSchedule } from "@/lib/vlr/jobs/sync-schedule";
import { isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:schedule", async () => {
    const { matches, rounds } = await syncSchedule();
    return {
      ok: true,
      summary: `✓ ${matches} partidas no calendário, ${rounds} rodadas semanais sincronizadas.`,
    };
  });
}
