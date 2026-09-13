"use client";

import { chamferPoints, spotlightRect, type Rect } from "@/lib/tour/geometry";

export type TourSpotlightProps = {
  rect: Rect | null;
  viewport: { width: number; height: number };
};

/**
 * O overlay escuro com o recorte chanfrado — mesmo corte do `clip-corner`
 * (`app/globals.css:132-141`), só que via SVG: o recorte precisa de uma
 * máscara, e `clip-path` cortaria a sombra do overlay junto com o buraco.
 *
 * Sem `rect` (passo sem alvo, ou alvo que não apareceu — Decisão 4), o
 * overlay cobre a tela inteira sem furo: o cartão fica centralizado por
 * cima, sem nada para destacar.
 */
export function TourSpotlight({ rect, viewport }: TourSpotlightProps) {
  const cut = rect ? spotlightRect(rect, viewport) : null;
  const points = cut ? chamferPoints(cut) : null;

  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 size-full"
    >
      <mask id="tour-spotlight-mask">
        <rect width="100%" height="100%" fill="white" />
        {points && <polygon points={points} fill="black" />}
      </mask>
      <rect
        width="100%"
        height="100%"
        className="fill-background/80"
        mask="url(#tour-spotlight-mask)"
      />
      {points && (
        <polygon
          points={points}
          className="fill-none stroke-primary motion-reduce:transition-none"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
