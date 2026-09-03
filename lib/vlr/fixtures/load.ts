import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Lê uma fixture de HTML real do vlr.gg. Só testes usam isto — nenhum teste
 * de scraper faz rede (CLAUDE.md: banco mockado, e aqui, rede nenhuma).
 */
export function readFixture(name: string): string {
  return readFileSync(
    path.join(process.cwd(), "lib/vlr/fixtures", name),
    "utf8",
  );
}
