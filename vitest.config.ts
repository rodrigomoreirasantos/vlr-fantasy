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
  },
});
