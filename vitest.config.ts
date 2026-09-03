import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // UTC fixo: testes de data (lib/market/window.ts) não podem depender do
    // fuso horário de quem roda a suíte.
    env: { TZ: "UTC" },
    // Teto de workers: cada fork sobe um jsdom inteiro (~150 MB) e, com
    // `node_modules` em `/mnt/c` (WSL2), leva dezenas de segundos. Sem teto o
    // vitest abre um por CPU (28 aqui, com ~4 GB livres) e workers estouram os
    // 60s de `START_TIMEOUT` — constante interna do vitest, não configurável.
    // O sintoma é "Timeout waiting for worker to respond" com os testes em si
    // passando. (`pool: "threads"` foi testado e piorou: 2 testes de
    // componente falham fora do isolamento de processo.)
    maxWorkers: 6,
  },
});
