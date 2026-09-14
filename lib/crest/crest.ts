import {
  CREST_COLORS,
  CREST_SHAPES,
  CREST_SYMBOLS,
  type CrestColor,
  type CrestShape,
  type CrestSymbol,
} from "@/lib/crest/catalog";
import type { Crest } from "@/lib/crest/types";

/** Composição de fallback — usada quando um campo salvo saiu do catálogo. */
export const DEFAULT_CREST: Crest = {
  shape: "shield",
  symbol: "crosshair",
  background: "graphite",
  foreground: "red",
  border: "red",
};

function isCrestShape(value: string): value is CrestShape {
  return (CREST_SHAPES as readonly string[]).includes(value);
}

function isCrestSymbol(value: string): value is CrestSymbol {
  return (CREST_SYMBOLS as readonly string[]).includes(value);
}

/**
 * Símbolo de um catálogo anterior → equivalente mais próximo no atual (poderes
 * dos agentes). Sem isto, todo brasão salvo antes da troca cairia no
 * `DEFAULT_CREST`. Mapa plano, sem encadear: cada id antigo aponta direto para
 * um id atual. `crosshair` sobreviveu a todas as trocas.
 */
const LEGACY_SYMBOLS: Readonly<Record<string, CrestSymbol>> = {
  // Catálogo original (ícones lucide).
  skull: "shade",
  ghost: "shade",
  star: "black-hole",
  crown: "crosshair",
  swords: "blade-storm",
  eye: "spycam",
  "shield-check": "hex-shield",
  bolt: "sonic-bolt",
  "zap-off": "sonic-bolt",
  flame: "fireball",
  target: "headhunter",
  // Objetos táticos (primeira versão do plano 28).
  headshot: "headhunter",
  spike: "blast-pack",
  knife: "blade-storm",
  radianite: "black-hole",
  "ult-orb": "black-hole",
  smoke: "shade",
  flash: "sonic-bolt",
  molly: "fireball",
  barrier: "hex-shield",
  recon: "bow",
  duelist: "blade-storm",
  initiator: "sonic-bolt",
  controller: "shade",
  sentinel: "spycam",
  ace: "crosshair",
  // Primeira leva de poderes, antes da curadoria.
  "orbital-strike": "crosshair",
  "owl-drone": "bow",
  healing: "frost-orb",
  "flame-bird": "fireball",
  "soul-eye": "shade",
  rocket: "blast-pack",
  "fault-line": "power-punch",
  cosmos: "black-hole",
  emp: "sonic-bolt",
  lightning: "sonic-bolt",
  nightmare: "shade",
  creature: "toxin",
  net: "turret",
  "barrier-shield": "hex-shield",
  "thorn-vine": "rose",
  "missile-swarm": "blast-pack",
  prism: "crosshair",
};

/** Aplica o alias antes de validar — um símbolo legado nunca some, vira o novo equivalente. */
function resolveCrestSymbol(value: string): string {
  return LEGACY_SYMBOLS[value] ?? value;
}

function isCrestColor(value: string): value is CrestColor {
  return (CREST_COLORS as readonly string[]).includes(value);
}

/**
 * Lê um brasão salvo (5 colunas `text` do banco) campo a campo, caindo no
 * default por campo quando o texto salvo não está mais no catálogo — é o que
 * permite renomear ou remover um símbolo sem quebrar linhas antigas.
 */
export function parseCrest(raw: {
  shape: string;
  symbol: string;
  background: string;
  foreground: string;
  border: string;
}): Crest {
  const symbol = resolveCrestSymbol(raw.symbol);

  return {
    shape: isCrestShape(raw.shape) ? raw.shape : DEFAULT_CREST.shape,
    symbol: isCrestSymbol(symbol) ? symbol : DEFAULT_CREST.symbol,
    background: isCrestColor(raw.background)
      ? raw.background
      : DEFAULT_CREST.background,
    foreground: isCrestColor(raw.foreground)
      ? raw.foreground
      : DEFAULT_CREST.foreground,
    border: isCrestColor(raw.border) ? raw.border : DEFAULT_CREST.border,
  };
}

/** Hash simples e determinístico — não é criptográfico, só espalha o seed. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * Composição default determinística a partir de um seed (`userId`), para
 * dois times novos não nascerem com o brasão idêntico. Cada campo usa um
 * primo diferente para dividir o hash — evita que formas e símbolos andem
 * sempre em sincronia (mesmo resto para todos os campos).
 */
export function defaultCrestFor(seed: string): Crest {
  const hash = hashSeed(seed);
  return {
    shape: CREST_SHAPES[hash % CREST_SHAPES.length],
    symbol: CREST_SYMBOLS[Math.floor(hash / 5) % CREST_SYMBOLS.length],
    background: CREST_COLORS[Math.floor(hash / 7) % CREST_COLORS.length],
    foreground: CREST_COLORS[Math.floor(hash / 11) % CREST_COLORS.length],
    border: CREST_COLORS[Math.floor(hash / 13) % CREST_COLORS.length],
  };
}
