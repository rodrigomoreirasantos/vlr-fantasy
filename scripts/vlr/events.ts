// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { syncEvents } from "@/lib/vlr/jobs/sync-events";
import { isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:events", async () => {
    const { count, autoTracked } = await syncEvents();
    return {
      ok: true,
      summary:
        `✓ ${count} eventos sincronizados, ${autoTracked.length} passaram a ser seguidos automaticamente. ` +
        "Ajuste exceções com `tracked_override` no `pnpm db:studio`.",
    };
  });
}
