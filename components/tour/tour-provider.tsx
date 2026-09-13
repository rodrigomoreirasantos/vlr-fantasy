"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { completeTour } from "@/app/(app)/actions";
import { TourCard } from "@/components/tour/tour-card";
import { TourSpotlight } from "@/components/tour/tour-spotlight";
import { useTourGeometry } from "@/components/tour/use-tour-geometry";
import { tourReducer, type TourState } from "@/lib/tour/machine";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { tourSelector, type TourTarget } from "@/lib/tour/targets";
import { waitForTarget } from "@/lib/tour/wait-for-target";

const TOTAL_STEPS = TOUR_STEPS.length;

type TourContextValue = {
  start: () => void;
  running: boolean;
};

const TourContext = createContext<TourContextValue | null>(null);

/**
 * O fuso do tour para quem está fora dele. **Lança** fora do provider —
 * como `useRegionDisplay` (`components/layout/region-display.tsx`): um
 * "Ver tutorial" que silenciosamente não faz nada é bug, não fallback
 * cosmético.
 */
export function useTour(): TourContextValue {
  const value = useContext(TourContext);
  if (!value) {
    throw new Error("useTour precisa de <TourProvider>.");
  }
  return value;
}

/**
 * O tour guiado inteiro: estado, navegação entre as quatro abas e a escrita
 * de "já visto". Mora no layout logado, e não em cada página, porque o fuso
 * — ao contrário da região (`RegionDisplayProvider`) — não muda na
 * navegação (`app/(app)/layout.tsx`).
 */
export function TourProvider({
  autoStart,
  children,
}: {
  autoStart: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<TourState>({ status: "idle" });
  const dispatch = (action: Parameters<typeof tourReducer>[1]) =>
    setState((current) => tourReducer(current, action, TOTAL_STEPS));

  // Evita reabrir o tour sozinho se um `router.refresh()` (TimezoneSync,
  // LiveRefresh) re-renderizar o layout com `autoStart` ainda `true` antes
  // de a Server Action terminar de gravar.
  const startedRef = useRef(false);
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      dispatch({ type: "start" });
    }
  }, [autoStart]);

  // Marca "visto" na transição running → idle — cobre next no último passo,
  // Esc, "Pular", "Agora não" e navegação alheia (abaixo), todos pelo mesmo
  // caminho: quem termina o tour é sempre esta mesma transição de estado.
  const { execute: runCompleteTour } = useAction(completeTour);
  const prevStatusRef = useRef(state.status);
  useEffect(() => {
    if (prevStatusRef.current === "running" && state.status === "idle") {
      runCompleteTour();
    }
    prevStatusRef.current = state.status;
  }, [state.status, runCompleteTour]);

  const stepIndex = state.status === "running" ? state.index : null;
  const step = stepIndex !== null ? TOUR_STEPS[stepIndex] : null;

  // Navega para a rota do passo, e resolve o alvo (primário → reserva →
  // desiste, Decisão 4) só depois de já estar na rota certa.
  const [resolvedTarget, setResolvedTarget] = useState<TourTarget | null>(
    null,
  );
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    // Sem alvo (o convite, passo 1): nada a resolver — a renderização deriva
    // "centralizado" direto do passo, sem tocar em estado nenhum aqui.
    if (!step || !step.target) return;

    if (step.route && step.route !== pathname) {
      router.push(step.route);
      return;
    }

    const controller = new AbortController();

    // As duas escritas de estado vivem dentro da função assíncrona (mesmo a
    // primeira, antes do primeiro `await`) — é o que faz este efeito
    // sincronizar com um sistema externo (o DOM, via `waitForTarget`) em vez
    // de só ajustar estado a partir de uma dependência que mudou.
    void (async () => {
      setResolving(true);
      setResolvedTarget(null);

      const primary = await waitForTarget(tourSelector(step.target!), {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (primary) {
        setResolvedTarget(step.target!);
        setResolving(false);
        return;
      }

      if (step.fallback) {
        const fallback = await waitForTarget(tourSelector(step.fallback), {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (fallback) {
          setResolvedTarget(step.fallback);
          setResolving(false);
          return;
        }
      }

      // Nem o alvo nem o reserva apareceram: o passo segue mesmo assim,
      // centralizado (Decisão 4) — nunca trava, nunca pula sozinho.
      setResolvedTarget(null);
      setResolving(false);
    })();

    return () => controller.abort();
  }, [step, stepIndex, pathname, router]);

  // Navegação que o próprio tour não iniciou (voltar do navegador, um link
  // qualquer) encerra e marca como visto (Decisão H) — nunca deixa o
  // destaque apontando para o alvo de uma página que não é mais esta.
  //
  // Ajuste de estado durante a renderização, não em efeito: é o padrão que a
  // própria doc do React recomenda para "reagir a uma prop que mudou"
  // (react.dev/learn/you-might-not-need-an-effect) — evita o vaivém extra de
  // um efeito só para comparar com o valor anterior. Nada de ref para saber
  // se a navegação foi do próprio tour: se a rota nova bate com a que o
  // passo atual pediu, foi o `router.push` do efeito acima; senão, foi o
  // usuário (voltar do navegador, um link).
  const [trackedPathname, setTrackedPathname] = useState(pathname);
  if (trackedPathname !== pathname) {
    setTrackedPathname(pathname);
    const expectedRoute = step?.route ?? null;
    if (state.status === "running" && pathname !== expectedRoute) {
      dispatch({ type: "close" });
    }
  }

  // Passo sem alvo (o convite): centralizado e sem "Carregando…", não importa
  // o que sobrou em `resolvedTarget`/`resolving` do passo anterior.
  const effectiveTarget = step?.target ? resolvedTarget : null;
  const effectiveResolving = step?.target ? resolving : false;
  const geometry = useTourGeometry(
    effectiveTarget,
    state.status === "running",
  );

  const contextValue = useMemo<TourContextValue>(
    () => ({
      start: () => dispatch({ type: "start" }),
      running: state.status === "running",
    }),
    [state.status],
  );

  return (
    <TourContext.Provider value={contextValue}>
      {children}
      {step && (
        <>
          <TourSpotlight rect={geometry.rect} viewport={geometry.viewport} />
          <TourCard
            step={step}
            stepNumber={(stepIndex ?? 0) + 1}
            totalSteps={TOTAL_STEPS}
            rect={geometry.rect}
            viewport={geometry.viewport}
            placement={geometry.placement}
            loading={effectiveResolving}
            onNext={() => dispatch({ type: "next" })}
            onBack={() => dispatch({ type: "back" })}
            onClose={() => dispatch({ type: "close" })}
          />
        </>
      )}
    </TourContext.Provider>
  );
}
