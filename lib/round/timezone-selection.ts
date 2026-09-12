import { cookies, headers } from "next/headers";

import {
  DISPLAY_FALLBACK_TZ,
  parseTimezone,
  TZ_COOKIE,
  VERCEL_TZ_HEADER,
} from "@/lib/round/timezone";

/**
 * O fuso em que esta requisição vai escrever as horas.
 *
 * Ordem: cookie do navegador → geolocalização de IP da Vercel → fallback.
 * O cookie vem **primeiro** porque é o relógio de verdade da pessoa; o header
 * é um chute bom (acerta o primeiro paint sem round-trip) e erra com VPN.
 * Nenhum dos dois é confiável como texto: os dois passam por `parseTimezone`.
 */
export async function resolveTimezone(): Promise<string> {
  const fromCookie = parseTimezone((await cookies()).get(TZ_COOKIE)?.value);
  const fromHeader =
    fromCookie ?? parseTimezone((await headers()).get(VERCEL_TZ_HEADER));
  return fromHeader ?? DISPLAY_FALLBACK_TZ;
}
