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
 * Um símbolo por poder marcante de cada agente, mais a mira neutra (padrão de
 * time novo — `DEFAULT_CREST`). Os ids e rótulos descrevem o **poder**, nunca
 * o nome do agente, e os desenhos são ícones licenciados do game-icons.net
 * (`components/crest/crest-symbols.tsx`), não arte da Riot. Símbolos de
 * catálogos anteriores são remapeados em `lib/crest/crest.ts`.
 */
export const CREST_SYMBOLS = [
  "crosshair",
  "blade-storm",
  "fireball",
  "blast-pack",
  "sonic-bolt",
  "rift-mask",
  "bolt-shield",
  "hex-shield",
  "bow",
  "wolf-hound",
  "power-punch",
  "shade",
  "toxin",
  "black-hole",
  "tidal-wave",
  "butterfly",
  "turret",
  "spycam",
  "frost-orb",
  "rose",
  "headhunter",
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
  "blade-storm": "Lâminas de arremesso",
  fireball: "Meteoro em chamas",
  "blast-pack": "Carga explosiva",
  "sonic-bolt": "Relâmpago sônico",
  "rift-mask": "Máscara dimensional",
  "bolt-shield": "Escudo com raio",
  "hex-shield": "Escudo hexagonal",
  bow: "Arco",
  "wolf-hound": "Lobo rastreador",
  "power-punch": "Soco explosivo",
  shade: "Sombra encapuzada",
  toxin: "Toxina",
  "black-hole": "Buraco negro",
  "tidal-wave": "Onda",
  butterfly: "Borboleta",
  turret: "Torreta",
  spycam: "Câmera espiã",
  "frost-orb": "Orbe congelado",
  rose: "Rosa",
  headhunter: "Pistola de precisão",
};
