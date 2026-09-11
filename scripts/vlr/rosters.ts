// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { syncRosters } from "@/lib/vlr/jobs/sync-rosters";
import { boolArg, isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:rosters", async () => {
    // `--all`: backfill único (Decisão 4, plano 18) — todo `vlr_team`
    // conhecido, não só quem tem partida na janela de relevância.
    const all = boolArg("all");
    const { enqueued } = await syncRosters(new Date(), { all });
    return {
      ok: true,
      summary: `✓ ${enqueued} elenco(s) enfileirado(s) para atualização${all ? " (--all)" : ""}.`,
    };
  });
}
