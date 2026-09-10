/**
 * Normaliza um termo de busca: minúsculas, sem acento, sem espaço nas
 * pontas. Mesma receita de `slugifyUsername` (`lib/auth/username.ts`), sem
 * o recorte de charset dela — aqui o termo continua livre (hífen, número,
 * espaço interno), só a comparação é que ignora caixa e diacríticos.
 *
 * Substring, não prefixo: "spa" acha "aspas". `trim()` só nas bordas —
 * espaço interno é parte do termo.
 */
export function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos (após normalize("NFD"))
    .toLowerCase()
    .trim();
}

/** `nickname` casa com o termo de busca já normalizado? Vazio casa com tudo. */
export function matchesSearch(
  nickname: string,
  normalizedQuery: string,
): boolean {
  if (normalizedQuery === "") return true;
  return normalizeSearchTerm(nickname).includes(normalizedQuery);
}
