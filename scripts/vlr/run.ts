import { pathToFileURL } from "node:url";

import { pool } from "@/db";
import { errorMessage, logError } from "@/lib/vlr/http/log";

/**
 * O invólucro comum dos oito entrypoints `vlr:*`: roda a função, imprime o
 * resumo, fecha o pool e devolve o exit code certo. O mesmo contrato de
 * `db/close-round.ts` — `.finally(() => pool.end())` — sem repeti-lo oito
 * vezes.
 */
export async function runScript(
  name: string,
  run: () => Promise<{ ok: boolean; summary: string }>,
): Promise<void> {
  try {
    const result = await run();
    console.log(result.summary);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    logError("vlr.script.failed", { script: name, error: errorMessage(error) });
    console.error(`✗ ${name} falhou: ${errorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

/** `--pages=20` → `20`. Sem o argumento, devolve `undefined`. */
export function numberArg(
  flag: string,
  argv = process.argv,
): number | undefined {
  const raw = argv.find((arg) => arg.startsWith(`--${flag}=`))?.split("=")[1];
  if (raw === undefined) return undefined;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `--${flag} precisa ser um inteiro positivo (recebido: ${raw}).`,
    );
  }
  return value;
}

/** `--match=724899` → `"724899"`. */
export function stringArg(
  flag: string,
  argv = process.argv,
): string | undefined {
  return argv.find((arg) => arg.startsWith(`--${flag}=`))?.split("=")[1];
}

/** `--force` presente → `true`. Bandeira sem valor, ausência é `false`. */
export function boolArg(flag: string, argv = process.argv): boolean {
  return argv.includes(`--${flag}`);
}

/**
 * Só executa ao ser chamado direto pelo `tsx`. Mesma guarda de
 * `db/close-round.ts`: `pathToFileURL` em vez de interpolar `file://`, porque
 * o caminho do projeto pode ter espaço ou acento — que exigem
 * percent-encoding para a comparação bater.
 */
export function isMain(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && importMetaUrl === pathToFileURL(entry).href;
}
