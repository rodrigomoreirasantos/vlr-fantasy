import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { getVlrConfig } from "@/lib/vlr/config";

/**
 * O HTML bruto é o dado; tudo depois dele é recomputável. Uma requisição por
 * partida grava o arquivo **antes** de qualquer parse — um seletor que
 * quebrou ou uma regra de scout que mudou se corrigem reprocessando o disco,
 * sem uma requisição nova e sem perder histórico.
 *
 * A interface é o ponto de troca por S3 mais adiante: quem chama nunca vê o
 * disco.
 */
export type RawStore = {
  /** Grava e devolve o caminho relativo, que vai para `match.rawHtmlPath`. */
  put(kind: string, id: string, html: string): Promise<string>;
  /** Lê pelo caminho devolvido por `put`. É o que sustenta `vlr:reprocess`. */
  get(storedPath: string): Promise<string>;
};

/** `2026-09-02T21:00:00.000Z` → `2026-09-02T21-00-00-000Z` (: e . não são amigos do Windows). */
function fileStamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/** Um segmento de caminho nunca sai do diretório de storage. */
function safeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "-");
  if (cleaned.length === 0) {
    throw new Error(`Segmento de caminho inválido: ${JSON.stringify(value)}`);
  }
  return cleaned;
}

export const diskRawStore: RawStore = {
  async put(kind, id, html) {
    const root = getVlrConfig().storageDir;
    const dir = path.join(root, safeSegment(kind), safeSegment(id));
    await mkdir(dir, { recursive: true });

    // Gzip: o HTML de uma partida tem ~230 KB e comprime para ~25 KB. Guardar
    // toda partida da temporada crua sairia caro por nada.
    const relative = path.join(
      root,
      safeSegment(kind),
      safeSegment(id),
      `${fileStamp(new Date())}.html.gz`,
    );
    await writeFile(relative, gzipSync(Buffer.from(html, "utf8")));
    return relative;
  },

  async get(storedPath) {
    // O caminho gravado é relativo ao cwd. Um cron que rode de outro
    // diretório quebraria justamente o `vlr:reprocess`, que é o pilar de "o
    // HTML bruto é o dado" — então, se não achar como está, tenta uma vez
    // resolvendo contra o diretório de storage configurado.
    const buffer = await readFile(storedPath).catch((error: unknown) => {
      const fallback = path.resolve(getVlrConfig().storageDir, storedPath);
      if (fallback === path.resolve(storedPath)) throw error;
      return readFile(fallback);
    });
    // Aceita os dois formatos: quem escreveu foi sempre o `put` acima, mas um
    // arquivo recuperado à mão pode chegar sem compressão.
    return storedPath.endsWith(".gz")
      ? gunzipSync(buffer).toString("utf8")
      : buffer.toString("utf8");
  },
};
