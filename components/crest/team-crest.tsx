import {
  CREST_COLOR_VARS,
  CREST_SYMBOL_ICONS,
  type CrestShape,
} from "@/lib/crest/catalog";
import type { Crest } from "@/lib/crest/types";
import { cn } from "@/lib/utils";

/** Um `<path>` por forma, num viewBox 64×64 compartilhado. */
const SHAPE_PATHS: Record<CrestShape, string> = {
  shield: "M32 4 L58 14 V32 C58 48 46 58 32 62 C18 58 6 48 6 32 V14 Z",
  diamond: "M32 4 L60 32 L32 60 L4 32 Z",
  circle: "M4 32 A28 28 0 1 1 60 32 A28 28 0 1 1 4 32 Z",
  chevron: "M32 4 L60 24 L60 60 L4 60 L4 24 Z",
  hex: "M32 4 L57 18 L57 46 L32 60 L7 46 L7 18 Z",
};

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
  const Icon = CREST_SYMBOL_ICONS[crest.symbol];
  const iconSize = Math.round(box * 0.5);

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
      </svg>
      <Icon
        aria-hidden
        style={{ color: CREST_COLOR_VARS[crest.foreground] }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        width={iconSize}
        height={iconSize}
      />
    </span>
  );
}
