// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { isMatchWindow } from "@/lib/vlr/jobs/cadence";
import { syncResults } from "@/lib/vlr/jobs/sync-results";
import { boolArg, isMain, numberArg, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:results", async () => {
    // Fora de dia de jogo não há resultado novo para descobrir, e a página
    // seria relida idêntica. `--force` é para a varredura diária, que precisa
    // pegar justamente o que ficou fora da janela.
    if (!boolArg("force") && !(await isMatchWindow())) {
      return {
        ok: true,
        summary: "· Nenhuma partida em curso — nada a sincronizar.",
      };
    }

    const { matches, enqueued, pages } = await syncResults({
      pages: numberArg("pages") ?? 1,
    });
    return {
      ok: true,
      summary: `✓ ${matches} resultados lidos em ${pages} página(s); ${enqueued} partidas enfileiradas para extração.`,
    };
  });
}
