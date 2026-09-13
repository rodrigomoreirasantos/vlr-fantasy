"use client";

import { useEffect, useState } from "react";

import { cardPlacement, type Rect } from "@/lib/tour/geometry";
import { tourSelector, type TourTarget } from "@/lib/tour/targets";

export type TourGeometry = {
  /** Retângulo do alvo agora, ou `null` (sem alvo, ou alvo ausente). */
  rect: Rect | null;
  viewport: { width: number; height: number };
  placement: ReturnType<typeof cardPlacement>;
};

function measureTarget(target: TourTarget | null): Rect | null {
  if (!target || typeof document === "undefined") return null;
  const el = document.querySelector(tourSelector(target));
  if (!el) return null;
  const { top, left, width, height } = el.getBoundingClientRect();
  return { top, left, width, height };
}

function measureViewport(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  );
}

function sameSize(
  a: { width: number; height: number },
  b: { width: number; height: number },
): boolean {
  return a.width === b.width && a.height === b.height;
}

/**
 * Mede o alvo e a viewport a cada frame enquanto `enabled` — um mecanismo só
 * para acompanhar `LiveRefresh`/`TimezoneSync`, scroll e resize (Decisão 5).
 * Se o nó do alvo sumir do DOM (React o trocou por outro igual, mesmo
 * `data-tour`), a próxima medição já busca de novo pelo seletor — não há
 * referência de elemento guardada em lugar nenhum para ficar obsoleta.
 */
export function useTourGeometry(
  target: TourTarget | null,
  enabled: boolean,
): TourGeometry {
  const [rect, setRect] = useState<Rect | null>(() => measureTarget(target));
  const [viewport, setViewport] = useState(measureViewport);

  useEffect(() => {
    if (!enabled) return;

    // Medição imediata, síncrona: um alvo que acabou de resolver aparece já
    // neste commit, sem esperar o primeiro frame do loop abaixo — que existe
    // só para acompanhar mudanças *depois* disso (scroll, resize, o próprio
    // `LiveRefresh`/`TimezoneSync` trocando o layout por baixo).
    const measure = () => {
      setRect((current) => {
        const next = measureTarget(target);
        return sameRect(current, next) ? current : next;
      });
      setViewport((current) => {
        const next = measureViewport();
        return sameSize(current, next) ? current : next;
      });
    };
    measure();

    let frame: number;
    const tick = () => {
      measure();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return { rect, viewport, placement: cardPlacement(rect, viewport) };
}
