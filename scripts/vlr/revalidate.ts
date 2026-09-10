// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { syncRevalidations } from "@/lib/vlr/jobs/revalidate-matches";
import { isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:revalidate", async () => {
    const { enqueued } = await syncRevalidations();
    return {
      ok: true,
      summary: `✓ ${enqueued} partida(s) enfileirada(s) para releitura tardia.`,
    };
  });
}
