/** `unique_violation` do Postgres — ver https://postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = "23505";

/** Profundidade máxima ao desembrulhar `cause` — corta ciclo e cadeia absurda. */
const MAX_CAUSE_DEPTH = 5;

/**
 * O erro veio da violação de uma constraint `UNIQUE` do Postgres?
 *
 * **Percorre a cadeia de `cause`.** O Drizzle não repassa o erro do `pg`: ele
 * o embrulha num `Error` genérico ("Failed query: …") e pendura o original em
 * `cause`. Olhar só o topo devolve `false` para toda violação de unique — e o
 * `catch` que dependia disso vira código morto, no exato caminho em que a
 * corretude importa (`ensureFantasyTeam`, `resolvePlayer`).
 */
export function isUniqueViolation(error: unknown): boolean {
  let current = error;

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return false;

    if (
      "code" in current &&
      (current as { code: unknown }).code === UNIQUE_VIOLATION
    ) {
      return true;
    }
    if (!("cause" in current)) return false;
    current = (current as { cause: unknown }).cause;
  }
  return false;
}
