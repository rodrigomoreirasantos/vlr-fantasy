// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { syncRosters } from "@/lib/vlr/jobs/sync-rosters";
import { isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:rosters", async () => {
    const { enqueued } = await syncRosters();
    return {
      ok: true,
      summary: `✓ ${enqueued} elenco(s) enfileirado(s) para atualização.`,
    };
  });
}
