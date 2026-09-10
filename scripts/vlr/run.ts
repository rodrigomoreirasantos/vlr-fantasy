import { pathToFileURL } from "node:url";

import { db, pool } from "@/db";
import { errorMessage, logError } from "@/lib/vlr/http/log";
import { recordJobRun } from "@/lib/vlr/persist/health";
import type { VlrJobHealthStatus } from "@/lib/vlr/jobs/types";

/**
 * O invólucro comum dos onze entrypoints `vlr:*`: roda a função, imprime o
 * resumo, grava o batimento (Decisão 7, plano 17), fecha o pool e devolve o
 * exit code certo. O mesmo contrato de `db/close-round.ts` —
 * `.finally(() => pool.end())` — sem repeti-lo onze vezes.
 *
 * `result.ok === false` já era, antes desta mudança, como `vlr:doctor` sinaliza
 * "rodei, mas achei problema" (seletor quebrado) sem lançar — vira `"failed"`
 * no batimento pelo mesmo motivo que vira exit code 1: é a condição que o
 * operador quer ver sinalizada.
 */
export async function runScript(
  name: string,
  run: () => Promise<{ ok: boolean; summary: string }>,
): Promise<void> {
  const startedAt = new Date();
  let status: VlrJobHealthStatus = "ok";
  let summary: string | null = null;
  let errorText: string | null = null;

  try {
    const result = await run();
    console.log(result.summary);
    summary = result.summary;
    if (!result.ok) {
      process.exitCode = 1;
      status = "failed";
    }
  } catch (error) {
    status = "failed";
    errorText = errorMessage(error);
    logError("vlr.script.failed", { script: name, error: errorText });
    console.error(`✗ ${name} falhou: ${errorText}`);
    process.exitCode = 1;
  } finally {
    // Uma falha ao gravar o batimento não pode mudar o exit code do job: o
    // trabalho em si já terminou (bem ou mal) antes deste bloco.
    try {
      await db.transaction((tx) =>
        recordJobRun(tx, {
          job: name,
          status,
          startedAt,
          finishedAt: new Date(),
          summary,
          error: errorText,
        }),
      );
    } catch (healthError) {
      logError("vlr.script.health_record_failed", {
        script: name,
        error: errorMessage(healthError),
      });
    }
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
