import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// Este módulo é o único caminho até o fuso de EXIBIÇÃO, e é importado por todo
// formatador — então estender os plugins aqui torna a extensão garantida, e
// não um efeito colateral de quem por acaso importou `lib/round/day.ts`.
dayjs.extend(utc);
dayjs.extend(timezone);

/** O cookie que o navegador escreve com o próprio fuso (`components/layout/timezone.tsx`). */
export const TZ_COOKIE = "vlr.tz";
/** Fuso por geolocalização de IP, entregue pela Vercel em produção. */
export const VERCEL_TZ_HEADER = "x-vercel-ip-timezone";

/**
 * O fuso em que a tela escreve quando não se sabe o de quem está lendo.
 *
 * Coincide com `GAME_DAY_TZ` porque o público é o mesmo, **não** porque um
 * derive do outro: são conceitos diferentes e podem divergir sem que nada
 * quebre. Literal repetido de propósito — ligar os dois convidaria alguém a
 * "arrumar" a regra de negócio mexendo no fallback de exibição.
 */
export const DISPLAY_FALLBACK_TZ = "America/Sao_Paulo";

/** Fuso IANA válido, ou `null` — no contrato de `parseTeamRegion` (`lib/round/regions.ts:65`). */
export function parseTimezone(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value });
    return value;
  } catch {
    return null; // `RangeError: Invalid time zone specified` — fato 9.
  }
}

/** O fuso do navegador, já validado. `null` fora do navegador ou se o Intl não souber. */
export function guessBrowserTimezone(): string | null {
  return parseTimezone(dayjs.tz.guess());
}
