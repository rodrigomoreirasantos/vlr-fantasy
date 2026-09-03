/**
 * Log estruturado em stdout — uma linha JSON por evento. Vinte linhas em vez
 * de uma dependência (`pino`): os jobs rodam por cron, e quem lê é `jq` ou o
 * coletor de logs, não um humano no terminal.
 */
type Level = "info" | "warn" | "error";

/** Campos livres do evento. `unknown` em vez de `any` — o CLAUDE.md proíbe `any`. */
export type LogFields = Record<string, unknown>;

function emit(level: Level, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logInfo(event: string, fields?: LogFields): void {
  emit("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields): void {
  emit("warn", event, fields);
}

export function logError(event: string, fields?: LogFields): void {
  emit("error", event, fields);
}

/** Mensagem de um erro desconhecido, sem `any` e sem `[object Object]`. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
