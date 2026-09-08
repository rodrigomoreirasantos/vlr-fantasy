import type { RoundMatch } from "@/lib/round/types";

/**
 * A **região** de um campeonato — o recorte pelo qual o usuário de fato lê o
 * circuito ("os jogos da minha liga"), e que `lib/round/events.ts` não
 * respondia: lá o eixo é a relevância do torneio (tier), aqui é de onde ele é.
 *
 * As duas dimensões são ortogonais de propósito: "Challengers Brazil" é
 * `development` **e** `americas`, e cada tela usa a que precisa.
 */
export const EVENT_REGIONS = [
  "international",
  "americas",
  "emea",
  "pacific",
  "china",
  "other",
] as const;

export type EventRegion = (typeof EVENT_REGIONS)[number];

/**
 * A tabela como **dado**, avaliada de cima para baixo. A ordem importa: um
 * "Masters Toronto" não pode casar com `americas` só porque acontece no Canadá
 * — o que define a região de um evento é a liga que ele reúne, não a cidade.
 * Por isso os tokens regionais são nomes de liga, e `international` é o que
 * sobra de Masters/Champions **depois** de nenhum deles casar.
 */
const REGION_PATTERNS: readonly { region: EventRegion; test: RegExp }[] = [
  {
    region: "americas",
    test: /americas|north america|latam|\bna\b|brazil|brasil|\bbr\b/,
  },
  { region: "emea", test: /emea|europe|\beu\b|turkey|mena|\bcis\b/ },
  {
    region: "pacific",
    test: /pacific|korea|japan|\bsea\b|south asia|oceania|\bapac\b/,
  },
  { region: "china", test: /\bchina\b|\bcn\b/ },
];

/** Masters e Champions sem token regional são o palco de todas as ligas juntas. */
const INTERNATIONAL = /\bmasters\b|\bchampions\b/;

/**
 * A bandeira que o vlr coloca no card do evento (`vlr_event.region`, ver
 * `regionFromFlagClass`). É **país**, não liga — por isso só entra como último
 * recurso, quando o nome não disse nada.
 */
const FLAG_REGIONS: Readonly<Record<string, EventRegion>> = {
  br: "americas",
  us: "americas",
  ca: "americas",
  ar: "americas",
  cl: "americas",
  mx: "americas",
  eu: "emea",
  de: "emea",
  fr: "emea",
  es: "emea",
  it: "emea",
  pt: "emea",
  pl: "emea",
  tr: "emea",
  ru: "emea",
  ua: "emea",
  gb: "emea",
  se: "emea",
  dk: "emea",
  fi: "emea",
  no: "emea",
  nl: "emea",
  be: "emea",
  cz: "emea",
  kr: "pacific",
  jp: "pacific",
  sg: "pacific",
  th: "pacific",
  ph: "pacific",
  id: "pacific",
  vn: "pacific",
  my: "pacific",
  tw: "pacific",
  hk: "pacific",
  in: "pacific",
  au: "pacific",
  nz: "pacific",
  cn: "china",
};

/**
 * `"Champions Tour 2026: Americas Stage 2"` → `"americas"`;
 * `"Valorant Masters Toronto"` → `"international"`.
 *
 * `regionCode` é a bandeira do vlr, usada **só** quando o nome não decide —
 * ele é o dado que sempre existe (`match.event` é `NOT NULL`), enquanto a
 * bandeira é opcional e pode vir vazia.
 */
export function eventRegion(
  event: string,
  regionCode?: string | null,
): EventRegion {
  const name = event.toLowerCase();

  const matched = REGION_PATTERNS.find((row) => row.test.test(name));
  if (matched) return matched.region;

  if (INTERNATIONAL.test(name)) return "international";

  const flag = regionCode?.toLowerCase();
  return (flag && FLAG_REGIONS[flag]) || "other";
}

const REGION_LABELS: Readonly<Record<EventRegion, string>> = {
  international: "Internacional",
  americas: "Americas",
  emea: "EMEA",
  pacific: "Pacific",
  china: "China",
  other: "Outros",
};

/** O rótulo do chip, em pt-BR. Os nomes de liga não se traduzem — "Americas" é o nome. */
export function regionLabel(region: EventRegion): string {
  return REGION_LABELS[region];
}

const REGION_ORDER: Readonly<Record<EventRegion, number>> = {
  international: 0,
  americas: 1,
  emea: 2,
  pacific: 3,
  china: 4,
  other: 5,
};

/**
 * A cor da região, como **token de tema** (`app/globals.css`) — nunca uma cor
 * literal. Cinco regiões, cinco `--chart-N`; "Outros" fica no cinza do texto
 * secundário, que é o que ele é.
 */
const REGION_TOKENS: Readonly<Record<EventRegion, string>> = {
  international: "--chart-1",
  americas: "--chart-2",
  emea: "--chart-3",
  pacific: "--chart-4",
  china: "--chart-5",
  other: "--muted-foreground",
};

/** `var(--chart-2)` — pronto para entrar num `style`, sem cor escrita à mão. */
export function regionColor(region: EventRegion): string {
  return `var(${REGION_TOKENS[region]})`;
}

/** A região de uma partida — nome do campeonato, com a bandeira como reforço. */
export function matchRegion(match: {
  event: string;
  regionCode?: string | null;
}): EventRegion {
  return eventRegion(match.event, match.regionCode);
}

/**
 * As partidas de uma região — `null` devolve a grade inteira.
 *
 * Existe porque dois componentes precisam do **mesmo** recorte: o relógio do
 * mercado no topo de "Próximos jogos" e a grade logo abaixo. Escrito duas
 * vezes, bastava uma divergência para o relógio passar a falar de um conjunto
 * de partidas diferente do que a lista mostra.
 */
export function matchesInRegion<
  T extends { event: string; regionCode?: string | null },
>(matches: readonly T[], region: EventRegion | null): T[] {
  if (region === null) return [...matches];
  return matches.filter((match) => matchRegion(match) === region);
}

/**
 * Ordena regiões pela relevância fixa de `EVENT_REGIONS` — internacional
 * primeiro. Existe para que todo chip de região da Home apareça na mesma
 * ordem, venha ele do calendário ou dos destaques.
 */
export function sortRegions(regions: readonly EventRegion[]): EventRegion[] {
  return [...regions].sort((a, b) => REGION_ORDER[a] - REGION_ORDER[b]);
}

/** Uma região presente no calendário, do jeito que o filtro a oferece. */
export type RegionFilterOption = {
  region: EventRegion;
  /** `regionLabel(region)` — o texto do chip. */
  label: string;
  /** Quantos jogos há nesta região — o filtro não mente sobre o que entrega. */
  count: number;
};

/**
 * As regiões do calendário, na ordem de `EVENT_REGIONS` (internacional
 * primeiro: Masters e Champions são o que move o mercado), com a contagem de
 * jogos de cada uma.
 */
export function regionFilterOptions(
  matches: readonly RoundMatch[],
): RegionFilterOption[] {
  const counts = new Map<EventRegion, number>();
  for (const match of matches) {
    const region = matchRegion(match);
    counts.set(region, (counts.get(region) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([region, count]) => ({
      region,
      label: regionLabel(region),
      count,
    }))
    .sort((a, b) => REGION_ORDER[a.region] - REGION_ORDER[b.region]);
}
