// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { backfill } from "@/lib/vlr/jobs/backfill";
import { isMain, numberArg, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:backfill", async () => {
    const result = await backfill({ pages: numberArg("pages") ?? 5 });

    const review =
      result.needsReview > 0
        ? ` ${result.needsReview} jogador(es) aguardando revisão — confira a função e marque \`active\` no \`pnpm db:studio\`.`
        : "";

    return {
      ok: result.failed === 0,
      summary: `✓ Backfill: ${result.pages} página(s), ${result.done} partidas extraídas, ${result.failed} falhas.${review}`,
    };
  });
}
