/** `trim()` + colapso de espaços internos — o que de fato vai para o banco. */
export function normalizeChampionshipName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}
