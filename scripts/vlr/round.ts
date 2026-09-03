// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { runRoundJob } from "@/lib/vlr/jobs/calculate-round";
import { isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:round", async () => {
    const result = await runRoundJob();

    if (result.status === "no-active-round") {
      return { ok: true, summary: "Nenhuma rodada ativa — nada a pontuar." };
    }
    if (result.status === "waiting") {
      return {
        ok: true,
        summary: `Aguardando: ${result.pending} partida(s) da rodada ainda sem estatísticas.`,
      };
    }
    return {
      ok: true,
      summary: `✓ Rodada ${result.closedRoundId} pontuada (${result.scoredPlayers} jogadores) e fechada.`,
    };
  });
}
