/**
 * Torneios que o fantasy segue por regra, não por lista fixa: as quatro ligas
 * regionais da VCT, Masters e Champions. Casa "VCT 2026 Pacific: Stage 2" e
 * "Valorant Champions 2026", nunca "Challengers", "Game Changers",
 * "Ascension", "Off Season" ou "Showmatch" — essas são o motivo pelo qual a
 * allowlist manual existia (`db/schema/vlr.ts:35-40`), e a regra automática
 * não pode reabrir essa porta.
 */
const EXCLUDED_NAME =
  /challengers|game changers|ascension|off season|showmatch/i;
const REGION_KEYWORD = /americas|emea|pacific|china/i;
const CIRCUIT_STAGE = /\bmasters\b|\bchampions\b/i;

const CIRCUIT_STATUSES = new Set(["ongoing", "upcoming"]);

/**
 * O evento é do circuito principal que o fantasy segue? Só nome e status —
 * nada de banco, nada de rede. `status` é o rótulo cru do vlr
 * (`lib/vlr/scrapers/event-list.ts`): "ongoing", "upcoming", "completed".
 *
 * A regra só serve para **ligar** `tracked` (`applyAutoTracking`,
 * `lib/vlr/persist/events.ts`) — nunca para desligar. Um evento `completed`
 * some daqui, mas isso não desmarca quem já foi seguido.
 */
export function isCircuitEvent(event: {
  name: string;
  status: string;
}): boolean {
  if (!CIRCUIT_STATUSES.has(event.status)) return false;
  if (EXCLUDED_NAME.test(event.name)) return false;

  if (CIRCUIT_STAGE.test(event.name)) return true;
  return /\bvct\b/i.test(event.name) && REGION_KEYWORD.test(event.name);
}
