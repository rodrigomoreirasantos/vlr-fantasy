/** `unique_violation` do Postgres — ver https://postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = "23505";

/** O erro veio da violação de uma constraint `UNIQUE` do Postgres? */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return (error as { code: unknown }).code === UNIQUE_VIOLATION;
}
