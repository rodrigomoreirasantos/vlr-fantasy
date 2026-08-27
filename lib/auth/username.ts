import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";

/** Login mínimo válido quando a semente (nome/e-mail) não sobra nada aproveitável. */
const FALLBACK_SEED = "jogador";
const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

/** `unique_violation` do Postgres — ver https://postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = "23505";

/**
 * Quantas vezes `assignUniqueUsername` refaz a tentativa quando outro
 * cadastro simultâneo leva o login escolhido. Cada rodada relê o banco, então
 * o candidato seguinte já considera quem ganhou a corrida — na prática uma
 * segunda tentativa basta.
 */
const MAX_ASSIGN_ATTEMPTS = 5;

/**
 * Normaliza uma semente (nome ou parte local do e-mail) num login válido:
 * minúsculas, sem acento, só `[a-z0-9_.]`, entre 3 e 20 caracteres. Espelha
 * a normalização padrão do plugin `username` do better-auth (lowercase),
 * então o valor gerado aqui já nasce no formato final salvo em `user.username`.
 */
export function slugifyUsername(seed: string): string {
  const slug = seed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos (após normalize("NFD"))
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, MAX_LENGTH);

  return slug.length >= MIN_LENGTH ? slug : FALLBACK_SEED;
}

/**
 * Gera um login único a partir de uma semente, tentando sufixos numéricos
 * (`base2`, `base3`, …) em caso de colisão. O predicado `exists` entra por
 * parâmetro para os testes não tocarem banco — em produção é `usernameExists`.
 */
export async function generateUniqueUsername(
  seed: string,
  exists: (username: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifyUsername(seed);

  if (!(await exists(base))) return base;

  for (let attempt = 2; ; attempt++) {
    const suffix = String(attempt);
    const candidate = `${base.slice(0, MAX_LENGTH - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
}

/** Login já cadastrado? */
export async function usernameExists(username: string): Promise<boolean> {
  const row = await db.query.user.findFirst({
    where: eq(user.username, username),
  });
  return row !== undefined;
}

/** O erro veio da constraint `user_username_unique` (ou outra `UNIQUE`)? */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return (error as { code: unknown }).code === UNIQUE_VIOLATION;
}

/**
 * O laço de tentativas da atribuição de login, com as dependências de banco
 * injetadas — mesmo motivo de `generateUniqueUsername`: o teste exercita a
 * corrida sem tocar banco. Em produção quem amarra as dependências é
 * `assignUniqueUsername`.
 *
 * `generateUniqueUsername` consulta e só então se escreve; entre as duas
 * coisas outro cadastro pode levar o mesmo candidato. A violação de
 * unicidade é capturada e a tentativa refeita — a releitura seguinte já
 * enxerga quem ganhou a corrida —, em vez de derrubar o cadastro com um erro
 * cru do Postgres. Qualquer outro erro sobe.
 */
export async function assignUsernameWithRetry(
  seed: string,
  exists: (username: string) => Promise<boolean>,
  persist: (username: string) => Promise<string | null>,
): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_ASSIGN_ATTEMPTS; attempt++) {
    const candidate = await generateUniqueUsername(seed, exists);

    try {
      return await persist(candidate);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  return null;
}

/**
 * Atribui um login a quem ainda não tem, **depois** de a linha existir — é o
 * único ponto em que dá para tratar a corrida (ver `assignUsernameWithRetry`).
 *
 * O `username IS NULL` no `where` garante idempotência: chamar de novo em
 * quem já tem login não sobrescreve nada.
 *
 * Devolve o login atribuído, ou `null` quando não havia o que fazer (já
 * tinha login) ou quando as tentativas se esgotaram — a coluna é nullable e
 * `backfillUsernames` (db/seed.ts) recupera esse caso raro.
 */
export async function assignUniqueUsername(
  userId: string,
  seed: string,
): Promise<string | null> {
  return assignUsernameWithRetry(seed, usernameExists, async (candidate) => {
    const [updated] = await db
      .update(user)
      .set({ username: candidate, displayUsername: candidate })
      .where(and(eq(user.id, userId), isNull(user.username)))
      .returning({ username: user.username });

    return updated?.username ?? null;
  });
}

/**
 * Normaliza o que o usuário digita ao convidar (com ou sem `@`, espaços,
 * maiúsculas) para o mesmo formato salvo em `user.username`.
 */
export function normalizeUsernameInput(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}
