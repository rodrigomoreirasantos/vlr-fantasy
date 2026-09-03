import type { RoundMatch } from "@/lib/round/types";

/**
 * Relevância de um campeonato para quem joga o fantasy.
 *
 * O circuito inteiro cabe na mesma lista, mas não pesa o mesmo: Champions e
 * Masters são os torneios que decidem a temporada e movem o mercado, e é por
 * eles que o usuário procura primeiro. A ordem vive aqui — pura e testável —
 * e não espalhada em `sort` dentro de componente.
 */
export const EVENT_TIERS = [
  "champions",
  "masters",
  "league",
  "development",
  "other",
] as const;

export type EventTier = (typeof EVENT_TIERS)[number];

/**
 * `"Valorant Champions 2026"` → `"champions"`.
 *
 * A ordem dos testes importa: "Champions Tour" é o nome do circuito inteiro
 * (`"Champions Tour 2026: Americas Stage 2"`), não do torneio final — casá-lo
 * como Champions colocaria toda liga regional no topo. Por isso ele é
 * descartado antes, e "Championship" (Game Changers) não casa com `\bchampions\b`.
 */
export function eventTier(event: string): EventTier {
  const name = event.toLowerCase();

  if (/game changers|\bgc\b|challengers|ascension/.test(name)) {
    return "development";
  }
  if (/\bchampions\b/.test(name) && !/champions tour/.test(name)) {
    return "champions";
  }
  if (/\bmasters\b/.test(name)) return "masters";
  if (/\bvct\b|champions tour|\bleague\b/.test(name)) return "league";

  return "other";
}

const TIER_ORDER: Record<EventTier, number> = {
  champions: 0,
  masters: 1,
  league: 2,
  development: 3,
  other: 4,
};

/**
 * O nome curto de um campeonato, para caber num chip de filtro.
 *
 * `"VCT 2026: Americas Stage 2"` → `"Americas Stage 2"`,
 * `"Valorant Champions 2026"` → `"Champions"`. O que sobra do nome longo é
 * ano e circuito — informação que se repete em todos os chips e portanto não
 * distingue nenhum deles. O nome inteiro continua no `title` do botão e na
 * linha de cada partida.
 */
export function shortEventLabel(event: string): string {
  const afterCircuit = event.includes(":")
    ? event.slice(event.indexOf(":") + 1)
    : event;

  const trimmed = afterCircuit
    .trim()
    .replace(/^valorant\s+/i, "")
    .replace(/\s*\b(19|20)\d{2}\b\s*/g, " ")
    .trim();

  // Um nome que era só ano e circuito não vira string vazia: melhor o nome
  // longo do que um chip sem rótulo.
  return trimmed || event;
}

/** Um campeonato presente no calendário, do jeito que o filtro o oferece. */
export type EventFilterOption = {
  event: string;
  /** `shortEventLabel(event)` — o texto do chip. */
  label: string;
  tier: EventTier;
  /** Quantos jogos deste campeonato há na lista — o filtro não mente sobre o que entrega. */
  count: number;
};

/**
 * Os campeonatos do calendário, ordenados por relevância e, dentro do mesmo
 * nível, pelo tamanho da grade (e o nome como desempate estável, para a
 * ordem não dançar entre renderizações com a mesma contagem).
 */
export function eventFilterOptions(
  matches: readonly RoundMatch[],
): EventFilterOption[] {
  const counts = new Map<string, number>();
  for (const match of matches) {
    counts.set(match.event, (counts.get(match.event) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([event, count]) => ({
      event,
      label: shortEventLabel(event),
      tier: eventTier(event),
      count,
    }))
    .sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        b.count - a.count ||
        a.event.localeCompare(b.event, "pt-BR"),
    );
}
