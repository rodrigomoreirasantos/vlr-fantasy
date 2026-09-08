// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { syncPlayerRegions } from "@/lib/vlr/jobs/sync-player-regions";
import { isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:regions", async () => {
    const result = await syncPlayerRegions();
    return {
      ok: true,
      summary:
        `✓ Regiões recalculadas: ${result.players} jogador(es), ${result.updated} atualizado(s). ` +
        `Distribuição: ${JSON.stringify(result.byRegion)}`,
    };
  });
}
