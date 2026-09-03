// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { workQueue } from "@/lib/vlr/jobs/work";
import { isMain, numberArg, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:work", async () => {
    const { done, failed } = await workQueue({
      limit: numberArg("limit") ?? 10,
    });
    return {
      // Falha isolada não derruba o lote, mas o exit code precisa contá-la —
      // é como o cron avisa.
      ok: failed === 0,
      summary: `✓ ${done} partidas extraídas, ${failed} falhas.`,
    };
  });
}
