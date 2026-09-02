import {
  Bolt,
  Crosshair,
  Crown,
  Eye,
  Flame,
  Ghost,
  ShieldCheck,
  Skull,
  Star,
  Swords,
  Target,
  ZapOff,
  type LucideIcon,
} from "lucide-react";

/** As cinco formas de moldura do brasão. */
export const CREST_SHAPES = [
  "shield",
  "diamond",
  "circle",
  "chevron",
  "hex",
] as const;
export type CrestShape = (typeof CREST_SHAPES)[number];

/**
 * Os símbolos são nomes de ícones lucide (`lucide-react` já é dependência) —
 * nada de path SVG escrito à mão. Ver `CREST_SYMBOL_ICONS`.
 */
export const CREST_SYMBOLS = [
  "crosshair",
  "skull",
  "bolt",
  "flame",
  "star",
  "swords",
  "eye",
  "shield-check",
  "zap-off",
  "target",
  "crown",
  "ghost",
] as const;
export type CrestSymbol = (typeof CREST_SYMBOLS)[number];

export const CREST_COLORS = [
  "red",
  "cyan",
  "green",
  "amber",
  "violet",
  "blue",
  "white",
  "graphite",
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
};

export const CREST_SHAPE_LABELS: Record<CrestShape, string> = {
  shield: "Escudo",
  diamond: "Losango",
  circle: "Círculo",
  chevron: "Seta",
  hex: "Hexágono",
};

export const CREST_SYMBOL_LABELS: Record<CrestSymbol, string> = {
  crosshair: "Mira",
  skull: "Caveira",
  bolt: "Raio",
  flame: "Chama",
  star: "Estrela",
  swords: "Espadas",
  eye: "Olho",
  "shield-check": "Escudo com check",
  "zap-off": "Raio cortado",
  target: "Alvo",
  crown: "Coroa",
  ghost: "Fantasma",
};

export const CREST_SYMBOL_ICONS: Record<CrestSymbol, LucideIcon> = {
  crosshair: Crosshair,
  skull: Skull,
  bolt: Bolt,
  flame: Flame,
  star: Star,
  swords: Swords,
  eye: Eye,
  "shield-check": ShieldCheck,
  "zap-off": ZapOff,
  target: Target,
  crown: Crown,
  ghost: Ghost,
};
