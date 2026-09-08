/** Nome do time derivado do `@login` (ou nome) do usuário, único por construção. */
export function deriveTeamName(seed: string): string {
  return `${seed} FC`;
}

/** `trim()` + colapso de espaços internos — a mesma normalização salva no banco. */
export function normalizeTeamName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Chave de unicidade em memória: `normalizeTeamName` + minúsculas, **sem**
 * remover acentos — precisa bater exatamente com `lower(btrim(name))` do
 * índice do banco (`fantasy_identity_name_uidx`), senão a checagem em TS e a do
 * banco divergem.
 */
export function teamNameKey(name: string): string {
  return normalizeTeamName(name).toLowerCase();
}

/** Próximo candidato em caso de colisão: `"rodrigo FC 2"`, `"rodrigo FC 3"`, … */
export function nextTeamNameCandidate(base: string, attempt: number): string {
  return `${base} ${attempt}`;
}
