import type { Cheerio, CheerioAPI } from "cheerio";

import { logWarn } from "@/lib/vlr/http/log";

/**
 * O `AnyNode` do `domhandler`, alcançado pelos tipos que o próprio cheerio
 * expõe. O cheerio 1.x não reexporta esse tipo, e adicionar `domhandler` ao
 * `package.json` seria uma dependência a mais só para escrever uma anotação.
 */
export type VlrNode = Parameters<CheerioAPI["contains"]>[0];

/**
 * Um seletor deixou de casar. Nunca devolvemos array vazio em silêncio: um
 * scraper que "funciona" e não extrai nada é como um pipeline se envenena —
 * o banco fica coerente e vazio, e ninguém descobre até um usuário reclamar
 * de pontuação zerada.
 */
export class SelectorMissError extends Error {
  constructor(
    readonly selector: string,
    readonly context: string,
  ) {
    super(`Seletor sem resultado: ${selector} (em ${context})`);
    this.name = "SelectorMissError";
  }
}

/** Texto do elemento, sem entidades e com espaços colapsados. */
export function text<T extends VlrNode>(el: Cheerio<T>): string {
  return el.text().replace(/\s+/g, " ").trim();
}

/** `"17"` → 17; `"+3"` → 3; vazio ou não numérico → `null`. */
export function int(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const match = raw.replace(/\s+/g, "").match(/-?\d+/);
  if (!match) return null;
  const value = Number.parseInt(match[0], 10);
  return Number.isFinite(value) ? value : null;
}

/** `"65%"` → 65. */
export function pct(raw: string | undefined | null): number | null {
  return int(raw);
}

/** `"1.20"` → 1.2. */
export function decimal(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const match = raw.replace(/\s+/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

/**
 * O id externo dentro de um href do vlr.
 *
 * - `vlrIdFromHref("/player/49871/yuno", "player")` → `"49871"`
 * - `vlrIdFromHref("/724899/flyquest-red-vs-axolotl")` → `"724899"` (partida:
 *   o id é o primeiro segmento, sem prefixo)
 */
export function vlrIdFromHref(
  href: string | undefined,
  prefix?: "player" | "team" | "event",
): string | null {
  if (!href) return null;
  const pattern = prefix
    ? new RegExp(`/${prefix}/(\\d+)(?:/|$)`)
    : /^(?:https?:\/\/[^/]+)?\/(\d+)(?:\/|$)/;
  return href.match(pattern)?.[1] ?? null;
}

/**
 * `find` que falha alto. Use sempre que a ausência do seletor for um bug do
 * scraper — o que é o caso de toda estrutura que a página garante ter.
 */
export function requireAll($: CheerioAPI, selector: string, context: string) {
  const found = $(selector);
  if (found.length === 0) throw new SelectorMissError(selector, context);
  return found;
}

/** Idem, mas a partir de um elemento já selecionado. */
export function requireWithin<T extends VlrNode>(
  scope: Cheerio<T>,
  selector: string,
  context: string,
) {
  const found = scope.find(selector);
  if (found.length === 0) throw new SelectorMissError(selector, context);
  return found;
}

/** Texto obrigatório: presente **e** não vazio. */
export function requireText<T extends VlrNode>(
  scope: Cheerio<T>,
  selector: string,
  context: string,
): string {
  const value = text(requireWithin(scope, selector, context).first());
  if (value.length === 0) throw new SelectorMissError(selector, context);
  return value;
}

/** A silhueta padrão do vlr para quem não tem foto — "sem foto", não uma foto. */
const VLR_PLACEHOLDER_IMG = "/img/base/ph/";

/**
 * `src` de uma `<img>` do vlr → URL absoluta pronta para `next/image`, ou
 * `null` quando não há foto de verdade.
 *
 * - Protocol-relative (`"//owcdn.net/..."`) ganha o esquema: é como o vlr
 *   sempre serve foto de jogador.
 * - O sentinela `/img/base/ph/*` é a silhueta genérica que o vlr devolve para
 *   quem não tem retrato — vira `null`, nunca uma "foto" repetida para vários
 *   jogadores.
 * - Qualquer outro caminho raiz-relativo (`/img/vlr/...`) não é uma foto de
 *   jogador conhecida hoje; vira `null` com aviso, para o dia em que o vlr
 *   trocar de CDN aparecer no log em vez de simplesmente sumir a foto.
 */
export function vlrImageUrl(src: string | undefined | null): string | null {
  const trimmed = src?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(VLR_PLACEHOLDER_IMG)) return null;

  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice(7)}`;
  if (trimmed.startsWith("https://")) return trimmed;

  logWarn("vlr.roster.unknown_image_host", { src: trimmed });
  return null;
}

/**
 * A região que o vlr codifica na **classe** da bandeira: `mod-kr` → `"kr"`.
 * `mod-un` (bandeira genérica) vira `null` — é ausência de informação, não uma
 * região chamada "un".
 */
export function regionFromFlagClass(
  className: string | undefined,
): string | null {
  if (!className) return null;
  const match = className.match(/\bmod-([a-z]{2})\b/);
  if (!match || match[1] === "un") return null;
  return match[1];
}
