// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { activateConfidentPlayers } from "@/lib/vlr/jobs/activate-confident-players";
import { isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:activate-reviewed", async () => {
    const result = await activateConfidentPlayers();
    return {
      ok: true,
      summary: `✓ ${result.activated}/${result.reviewed} jogador(es) represado(s) tinham identidade confiável e foram liberados no mercado.`,
    };
  });
}
