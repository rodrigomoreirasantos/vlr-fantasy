/**
 * As formas de moldura do brasão — 5 originais + 6 novas (plano 28, Fase 5).
 * `chamfer` é a assinatura visual do próprio app (o mesmo corte de
 * `clip-corner`, `app/globals.css`).
 */
export const CREST_SHAPES = [
  "shield",
  "diamond",
  "circle",
  "chevron",
  "hex",
  "chamfer",
  "octagon",
  "kite",
  "delta",
  "banner",
  "heater",
] as const;
export type CrestShape = (typeof CREST_SHAPES)[number];

/**
 * Símbolos em SVG original (`components/crest/crest-symbols.tsx`), desenhados
 * à mão e inspirados no jogo — nunca ícones ou arte oficial da Riot (Decisão
 * D1, plano 28). Substituem o antigo catálogo de ícones lucide (caveira,
 * fantasma, coroa…): `lib/crest/crest.ts` mapeia cada símbolo antigo para um
 * destes, então brasões salvos antes desta migração continuam de pé.
 */
export const CREST_SYMBOLS = [
  "crosshair",
  "headshot",
  "spike",
  "knife",
  "radianite",
  "ult-orb",
  "smoke",
  "flash",
  "molly",
  "barrier",
  "recon",
  "duelist",
  "initiator",
  "controller",
  "sentinel",
  "ace",
] as const;
export type CrestSymbol = (typeof CREST_SYMBOLS)[number];

/** 8 cores originais + 8 novas (plano 28, Fase 5) — dobra a paleta. */
export const CREST_COLORS = [
  "red",
  "cyan",
  "green",
  "amber",
  "violet",
  "blue",
  "white",
  "graphite",
  "crimson",
  "orange",
  "gold",
  "teal",
  "navy",
  "purple",
  "magenta",
  "black",
] as const;
export type CrestColor = (typeof CREST_COLORS)[number];

/** Cor do catálogo → variável de tema (`app/globals.css`). Nunca cor Tailwind crua. */
export const CREST_COLOR_VARS: Record<CrestColor, string> = {
  red: "var(--crest-red)",
  cyan: "var(--crest-cyan)",
  green: "var(--crest-green)",
  amber: "var(--crest-amber)",
  violet: "var(--crest-violet)",
  blue: "var(--crest-blue)",
  white: "var(--crest-white)",
  graphite: "var(--crest-graphite)",
  crimson: "var(--crest-crimson)",
  orange: "var(--crest-orange)",
  gold: "var(--crest-gold)",
  teal: "var(--crest-teal)",
  navy: "var(--crest-navy)",
  purple: "var(--crest-purple)",
  magenta: "var(--crest-magenta)",
  black: "var(--crest-black)",
};

export const CREST_COLOR_LABELS: Record<CrestColor, string> = {
  red: "Vermelho",
  cyan: "Ciano",
  green: "Verde",
  amber: "Âmbar",
  violet: "Violeta",
  blue: "Azul",
  white: "Branco",
  graphite: "Grafite",
  crimson: "Carmesim",
  orange: "Laranja",
  gold: "Dourado",
  teal: "Verde-azulado",
  navy: "Marinho",
  purple: "Roxo",
  magenta: "Magenta",
  black: "Obsidiana",
};

export const CREST_SHAPE_LABELS: Record<CrestShape, string> = {
  shield: "Escudo",
  diamond: "Losango",
  circle: "Círculo",
  chevron: "Seta",
  hex: "Hexágono",
  chamfer: "Chanfrado",
  octagon: "Octógono",
  kite: "Escudo pipa",
  delta: "Delta",
  banner: "Flâmula",
  heater: "Brasão clássico",
};

export const CREST_SYMBOL_LABELS: Record<CrestSymbol, string> = {
  crosshair: "Mira",
  headshot: "Headshot",
  spike: "Spike",
  knife: "Faca",
  radianite: "Radianita",
  "ult-orb": "Orbe definitivo",
  smoke: "Fumaça",
  flash: "Flash",
  molly: "Incendiário",
  barrier: "Barreira",
  recon: "Radar",
  duelist: "Duelista",
  initiator: "Iniciador",
  controller: "Controlador",
  sentinel: "Sentinela",
  ace: "Ace",
};
