/**
 * Constantes do canal de seleção de região (`.claude/plans/10-time-por-regiao.md`,
 * decisão 8) — separadas de `lib/team/region-selection.ts` para que `proxy.ts`
 * (bundle de Edge) não precise importar `next/headers` só para ler três
 * strings.
 */
export const REGION_COOKIE = "vlr.region";
/** O canal que o `proxy.ts` usa para propagar a escolha desta requisição — ver o comentário lá sobre por que não basta o cookie. */
export const REGION_HEADER = "x-vlr-region";
export const REGION_PARAM = "region";
