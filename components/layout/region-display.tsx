"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { TeamRegion } from "@/lib/round/regions";

/** O que o header mostra do time em exibição — os dois campos que mudam com a região. */
export type RegionDisplay = {
  region: TeamRegion;
  /** Pontuação do time **daquela** região, já com o ×2 do capitão. */
  points: number;
};

/**
 * Quem manda no header é a **página**, não o layout
 * (`.claude/plans/10-time-por-regiao.md`, decisão 8).
 *
 * O motivo é do App Router, não de gosto: *"Layouts do not rerender on
 * navigation, so they cannot access search params which would otherwise
 * become stale"* (`next/dist/docs/.../layout.md`). `app/(app)/layout.tsx` é
 * compartilhado por `/my-team`, `/home`, `/profile` e `/ranking`, então
 * trocar de aba de região (`?region=`) re-renderiza só o segmento da página
 * — o layout fica com a região e a pontuação da primeira renderização, e o
 * header passaria a contradizer a tela ao lado.
 *
 * A saída é inverter a direção: o layout só semeia o valor inicial (a
 * renderização do servidor, que acerta em cheio no carregamento completo), e
 * cada página que resolve uma região publica a sua com `<RegionDisplaySync>`.
 * Client Components **re-renderizam** na navegação, então o header acompanha.
 */
const ValueContext = createContext<RegionDisplay | null>(null);
// Contexto separado para o setter: `setState` do `useState` é estável, então
// `<RegionDisplaySync>` não re-dispara o efeito a cada render do provider —
// o que, com um objeto novo a cada render, seria um laço infinito.
const SetterContext = createContext<Dispatch<
  SetStateAction<RegionDisplay>
> | null>(null);

export function RegionDisplayProvider({
  initial,
  children,
}: {
  initial: RegionDisplay;
  children: React.ReactNode;
}) {
  const [display, setDisplay] = useState(initial);

  return (
    <SetterContext.Provider value={setDisplay}>
      <ValueContext.Provider value={display}>{children}</ValueContext.Provider>
    </SetterContext.Provider>
  );
}

/** O time em exibição agora. Lança fora do provider — é erro de montagem, não estado possível. */
export function useRegionDisplay(): RegionDisplay {
  const display = useContext(ValueContext);
  if (!display) {
    throw new Error("useRegionDisplay precisa de <RegionDisplayProvider>.");
  }
  return display;
}

/**
 * Publica a região da página para o header. Não renderiza nada — existe só
 * para carregar o efeito, do jeito que uma página (Server Component) tem de
 * falar com um Client Component acima dela na árvore.
 */
export function RegionDisplaySync({ region, points }: RegionDisplay) {
  const setDisplay = useContext(SetterContext);

  useEffect(() => {
    // Devolver o objeto atual quando nada mudou faz o React abortar o
    // re-render (`Object.is`) — sem isso, cada render publicaria um objeto
    // novo e o provider re-renderizaria para sempre.
    setDisplay?.((current) =>
      current.region === region && current.points === points
        ? current
        : { region, points },
    );
  }, [setDisplay, region, points]);

  return null;
}
