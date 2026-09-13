/**
 * A geometria do destaque — puro, sem DOM. `TourSpotlight`/`TourCard`
 * (Fase 2) chamam isto a cada medição; manter fora do componente é o que
 * torna "onde o recorte cai" e "de que lado o cartão abre" testáveis sem
 * `getBoundingClientRect` nenhum.
 */
export type Rect = { top: number; left: number; width: number; height: number };

const DEFAULT_PADDING = 8;
/** Mesmo corte do `clip-corner` (`app/globals.css:132-141`). */
const DEFAULT_CLIP = 12;
/** Altura aproximada do `TourCard` — só usada para decidir de que lado ele cabe. */
const DEFAULT_CARD_HEIGHT = 220;
/** Acima disso, o alvo ocupa espaço demais para o cartão flutuar do lado —
 *  o caso de um painel inteiro em tela de telefone. */
const DOCKED_HEIGHT_RATIO = 0.7;

/** O recorte do overlay: o alvo com uma folga, recortado à viewport. */
export function spotlightRect(
  target: Rect,
  viewport: { width: number; height: number },
  padding: number = DEFAULT_PADDING,
): Rect {
  const left = Math.max(0, target.left - padding);
  const top = Math.max(0, target.top - padding);
  const right = Math.min(viewport.width, target.left + target.width + padding);
  const bottom = Math.min(viewport.height, target.top + target.height + padding);
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Os 6 pontos do polígono chanfrado — mesma forma do `clip-corner`: os
 * cantos superior-esquerdo e inferior-direito cortados, os outros dois retos.
 * Devolve `"x,y x,y …"`, pronto para o atributo `points` de um `<polygon>`.
 */
export function chamferPoints(rect: Rect, clip: number = DEFAULT_CLIP): string {
  const { left, top, width, height } = rect;
  const points: Array<readonly [number, number]> = [
    [left + clip, top],
    [left + width, top],
    [left + width, top + height - clip],
    [left + width - clip, top + height],
    [left, top + height],
    [left, top + clip],
  ];
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

/**
 * De que lado o `TourCard` deve abrir. `null` (passo sem alvo, ou alvo que
 * não apareceu) sempre centraliza. Um alvo alto demais (painel inteiro em
 * telefone) não sobra espaço nem acima nem abaixo — o cartão fica "docked"
 * no rodapé da tela, fixo, em vez de flutuar ao lado de algo enorme.
 */
export function cardPlacement(
  target: Rect | null,
  viewport: { width: number; height: number },
  cardHeight: number = DEFAULT_CARD_HEIGHT,
): "bottom" | "top" | "docked" | "center" {
  if (!target) return "center";
  if (target.height >= viewport.height * DOCKED_HEIGHT_RATIO) return "docked";

  const spaceBelow = viewport.height - (target.top + target.height);
  const spaceAbove = target.top;

  if (spaceBelow >= cardHeight) return "bottom";
  if (spaceAbove >= cardHeight) return "top";
  return "docked";
}
