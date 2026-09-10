// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { runHealth } from "@/lib/vlr/jobs/health";
import { isMain, runScript } from "@/scripts/vlr/run";

/**
 * `pnpm vlr:health` — sem rede. É o comando que o `healthcheck` do
 * `docker-compose.yml` chama; sai com código ≠ 0 quando algo está atrasado,
 * nunca rodou, ou terminou em falha (Decisão 7, plano 17).
 */
if (isMain(import.meta.url)) {
  void runScript("vlr:health", async () => {
    const { healthy, stale } = await runHealth();
    return {
      ok: healthy,
      summary: healthy
        ? "✓ Todos os jobs em dia."
        : `✗ Atrasado(s), sem rodar, ou em falha: ${stale.join(", ")}.`,
    };
  });
}
