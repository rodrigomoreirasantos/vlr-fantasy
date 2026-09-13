import {
  CREST_SYMBOL_PATHS,
  CREST_SYMBOL_VIEWBOX,
} from "@/components/crest/crest-symbols";
import { CREST_COLOR_VARS, type CrestShape } from "@/lib/crest/catalog";
import type { Crest } from "@/lib/crest/types";
import { cn } from "@/lib/utils";

/**
 * Um `<path>` por forma, num viewBox 64×64 compartilhado. `chamfer` repete o
 * mesmo corte de canto do `clip-corner` (`app/globals.css`) — a assinatura
 * visual do próprio app virando opção de brasão (plano 28, Fase 5).
 */
export const SHAPE_PATHS: Record<CrestShape, string> = {
  shield: "M32 4 L58 14 V32 C58 48 46 58 32 62 C18 58 6 48 6 32 V14 Z",
  diamond: "M32 4 L60 32 L32 60 L4 32 Z",
  circle: "M4 32 A28 28 0 1 1 60 32 A28 28 0 1 1 4 32 Z",
  chevron: "M32 4 L60 24 L60 60 L4 60 L4 24 Z",
  hex: "M32 4 L57 18 L57 46 L32 60 L7 46 L7 18 Z",
  chamfer: "M20 6 L58 6 L58 44 L44 58 L6 58 L6 20 Z",
  octagon: "M20 6 L44 6 L58 20 L58 44 L44 58 L20 58 L6 44 L6 20 Z",
  kite: "M8 10 L56 10 L52 34 L32 62 L12 34 Z",
  delta: "M6 8 L58 8 L32 60 Z",
  banner: "M8 6 L56 6 L56 56 L32 46 L8 56 Z",
  heater:
    "M10 6 L54 6 L54 30 C54 48 44 58 32 62 C20 58 10 48 10 30 Z",
};

/** O símbolo ocupa pouco mais da metade do brasão, centralizado, em unidades
 * do próprio viewBox (`x`/`y`/`width`/`height` do `<svg>` aninhado) — escala
 * junto com o brasão inteiro sem depender do tamanho renderizado em pixels. */
const SYMBOL_BOX = 36;
const SYMBOL_OFFSET = (64 - SYMBOL_BOX) / 2;

const SIZE_PX = { sm: 28, md: 44, podium: 72, lg: 128 } as const;

export type TeamCrestSize = keyof typeof SIZE_PX;

export type TeamCrestProps = {
  crest: Crest;
  size?: TeamCrestSize;
  /** Nome acessível do brasão, ex. "Brasão de Sentinels BR". */
  title: string;
  className?: string;
};

/**
 * O brasão do time desenhado a partir de dados — forma + símbolo + 3 cores de
 * paleta, nunca uma imagem. Puramente apresentacional, sem `"use client"`:
 * roda tanto no server (header, ranking) quanto no client (editor de perfil).
 */
export function TeamCrest({
  crest,
  size = "md",
  title,
  className,
}: TeamCrestProps) {
  const box = SIZE_PX[size];

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: box, height: box }}
    >
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label={title}
        className="absolute inset-0 h-full w-full"
      >
        <path
          d={SHAPE_PATHS[crest.shape]}
          style={{
            fill: CREST_COLOR_VARS[crest.background],
            stroke: CREST_COLOR_VARS[crest.border],
          }}
          strokeWidth={3}
        />
        <svg
          x={SYMBOL_OFFSET}
          y={SYMBOL_OFFSET}
          width={SYMBOL_BOX}
          height={SYMBOL_BOX}
          viewBox={CREST_SYMBOL_VIEWBOX}
          style={{ fill: CREST_COLOR_VARS[crest.foreground] }}
        >
          {CREST_SYMBOL_PATHS[crest.symbol].map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </svg>
    </span>
  );
}
