// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { runDoctor } from "@/lib/vlr/jobs/doctor";
import { isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:doctor", async () => {
    const { checks, healthy, needsReview, scrapedMatches, playersOutOfRegion } =
      await runDoctor();

    const lines = checks.map((check) => {
      const icon = check.status === "ok" ? "✓" : "✗";
      const detail =
        check.status === "ok"
          ? `${check.found} resultado(s)`
          : check.status === "empty"
            ? "0 resultados — seletor provavelmente quebrado"
            : (check.error ?? "erro");
      return `  ${icon} ${check.name.padEnd(14)} ${check.path} — ${detail}`;
    });

    return {
      ok: healthy,
      summary: [
        healthy
          ? "✓ Todos os seletores respondendo."
          : "✗ Há seletores quebrados.",
        ...lines,
        `  · ${scrapedMatches} partidas extraídas, ${needsReview} jogador(es) aguardando revisão, ${playersOutOfRegion} fora de região.`,
      ].join("\n"),
    };
  });
}
