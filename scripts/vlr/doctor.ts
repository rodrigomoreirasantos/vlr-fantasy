// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { runDoctor } from "@/lib/vlr/jobs/doctor";
import { isMain, runScript } from "@/scripts/vlr/run";

if (isMain(import.meta.url)) {
  void runScript("vlr:doctor", async () => {
    const {
      checks,
      healthy,
      needsReview,
      scrapedMatches,
      playersOutOfRegion,
      staleJobs,
      dismissedMatches,
      rosterMissing,
    } = await runDoctor();

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
          ? "✓ Seletores OK e todos os jobs em dia."
          : "✗ Há seletor quebrado ou job atrasado/sem rodar/em falha.",
        ...lines,
        staleJobs.length > 0
          ? `  ✗ Job(s) fora do prazo: ${staleJobs.join(", ")}.`
          : null,
        `  · ${scrapedMatches} partidas extraídas, ${needsReview} jogador(es) aguardando revisão, ${playersOutOfRegion} fora de região.`,
        `  · ${dismissedMatches} partida(s) descartada(s), ${rosterMissing} jogador(es) fora do elenco da organização.`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    };
  });
}
