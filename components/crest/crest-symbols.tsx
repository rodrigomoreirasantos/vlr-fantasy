import type { CrestSymbol } from "@/lib/crest/catalog";

/**
 * Um `<path>`/`<circle>` por símbolo, num viewBox 24×24 compartilhado — SVG
 * original desenhado à mão (plano 28, Fase 5, Decisão D1), nunca ícone ou
 * arte oficial da Riot. `stroke`/`fill` **não** vêm fixados aqui: quem monta
 * o `<svg>` em volta (`CrestSymbolIcon` abaixo, ou `TeamCrest`) define
 * `stroke="currentColor"` uma vez só — elementos sólidos (a ponta da faca, o
 * pavio do spike, o miolo da chama) marcam `fill="currentColor" stroke="none"`
 * por conta própria, para não herdar o contorno vazado dos demais traços.
 */
export const CREST_SYMBOL_PATHS: Record<CrestSymbol, React.ReactNode> = {
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  headshot: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  spike: (
    <>
      <path d="M8 20V12L12 4l4 8v8Z" />
      <path d="M12 4V1" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  knife: (
    <>
      <path d="M4 20 13 11" />
      <path
        d="M11.5 7.5 19 4l-2.5 7.5-5-1Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  radianite: (
    <>
      <path d="M12 2 18 9 15 22H9L6 9Z" />
      <path d="M6 9h12M12 2v20" />
    </>
  ),
  "ult-orb": (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.5 5.5l2 2M16.5 16.5l2 2M18.5 5.5l-2 2M5.5 18.5l2-2" />
    </>
  ),
  smoke: (
    <path d="M4 18.5c0-2 1.6-3.2 3.4-2.7C8 14 10 12.8 12 13.4c1.8-1.2 4.6-.4 4.9 1.9 1.7.2 3.1 1.4 3.1 3.2 0 1.2-1 2-2.2 2H6.2C5 20.5 4 19.7 4 18.5Z" />
  ),
  flash: (
    <path d="M12 2v5M12 17v5M3 12h5M16 12h5M6 6l3.5 3.5M14.5 14.5 18 18M18 6l-3.5 3.5M9.5 14.5 6 18" />
  ),
  molly: (
    <path
      d="M12 2c2.6 3.4 4.5 5.9 4.5 9.2a4.5 4.5 0 0 1-9 0c0-1.6.7-2.6 1.6-3.5-.1 1.6.7 2.4 1.6 1.9-1-2.6-.4-5.2 1.3-7.6Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  barrier: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="1.5" />
      <path d="M4 12h16M9 6v12M15 6v12" />
    </>
  ),
  recon: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12 18 6" />
    </>
  ),
  duelist: <path d="M4 20 20 4M13 4h7v7" />,
  initiator: <path d="M3 12h12M10 6l6 6-6 6" />,
  controller: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  sentinel: (
    <>
      <path d="M12 3 20 7v6c0 5-4 7.8-8 9-4-1.2-8-4-8-9V7Z" />
      <path d="M12 3v19" />
    </>
  ),
  ace: <path d="M6 20 12 4l6 16M8.5 14h7" />,
};

export type CrestSymbolIconProps = {
  symbol: CrestSymbol;
  className?: string;
};

/**
 * O símbolo sozinho, fora do brasão — usado no editor (`CrestEditor`) para a
 * miniatura de cada opção. `TeamCrest` desenha o mesmo `CREST_SYMBOL_PATHS`
 * diretamente dentro do próprio `<svg>` do brasão, sem passar por aqui.
 */
export function CrestSymbolIcon({ symbol, className }: CrestSymbolIconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {CREST_SYMBOL_PATHS[symbol]}
    </svg>
  );
}
