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
import { scrollAlignment } from "@/lib/tour/geometry";
import { tourReducer, type TourState } from "@/lib/tour/machine";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { tourSelector, type TourTarget } from "@/lib/tour/targets";
import { DEFAULT_TIMEOUT_MS, waitForTarget } from "@/lib/tour/wait-for-target";

/**
 * Rola a página até o elemento antes de ele virar estado (plano 27, Fase 2 —
 * `.claude/plans/27-tour-passo-a-passo.md`): sem isto, um alvo abaixo da
 * dobra vira recorte de altura zero (`spotlightRect` clampa à viewport) e o
 * cartão flutua sem apontar para nada.
 *
 * `behavior: "auto"` (instantâneo) de propósito: com rolagem suave, o
 * `virtualRef` do `PopoverAnchor` e o laço de `requestAnimationFrame` de
 * `useTourGeometry` ficariam medindo posições intermediárias, e o cartão
 * "andaria" durante a animação.
 */
function scrollTargetIntoView(element: Element) {
  const rect = element.getBoundingClientRect();
  element.scrollIntoView({
    block: scrollAlignment(rect, { height: window.innerHeight }),
    behavior: "auto",
  });
}

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

  // O passo **pronto para ser mostrado**: só avança quando a rota certa já
  // está de pé e o alvo (achado, no reserva, ou desistido — Decisão 4) já
  // foi resolvido. É o que segura o cartão no passo anterior em vez de
  // anunciar a tela nova antes dela existir (plano 27, Fase 3 —
  // `.claude/plans/27-tour-passo-a-passo.md`).
  const [readyIndex, setReadyIndex] = useState<number | null>(null);
  const [resolvedTarget, setResolvedTarget] = useState<TourTarget | null>(
    null,
  );

  // Marca "visto" na transição running → idle — cobre next no último passo,
  // Esc, "Pular", "Agora não" e navegação alheia (abaixo), todos pelo mesmo
  // caminho: quem termina o tour é sempre esta mesma transição de estado.
  // A transição oposta (idle → running, reabrindo pelo menu depois de já ter
  // percorrido o tour uma vez) zera `readyIndex`/`resolvedTarget` — sem isto
  // o passo 13 antigo pisca por um instante antes do passo 1 novo assumir.
  const { execute: runCompleteTour } = useAction(completeTour);
  const prevStatusRef = useRef(state.status);
  useEffect(() => {
    if (prevStatusRef.current === "running" && state.status === "idle") {
      runCompleteTour();
    }
    if (prevStatusRef.current === "idle" && state.status === "running") {
      setReadyIndex(null);
      setResolvedTarget(null);
    }
    prevStatusRef.current = state.status;
  }, [state.status, runCompleteTour]);

  const stepIndex = state.status === "running" ? state.index : null;
  // O passo que a máquina já mandou seguir — pode estar à frente do que a
  // tela mostra (`displayStep` abaixo) enquanto a rota nova ainda carrega.
  const step = stepIndex !== null ? TOUR_STEPS[stepIndex] : null;

  useEffect(() => {
    if (!step) return;

    if (step.route && step.route !== pathname) {
      router.push(step.route);

      // Watchdog: se a rota nunca comitar (Supabase frio, rede ruim), o
      // passo publica assim mesmo, centralizado — a mesma garantia de nunca
      // travar que já vale para um alvo que não aparece (Decisão 4, plano
      // 25), com a mesma janela de espera (`DEFAULT_TIMEOUT_MS`,
      // `lib/tour/wait-for-target.ts`) para não inventar um segundo número.
      // Se a rota comitar antes (`pathname` muda), este efeito é
      // desmontado e o timer nunca dispara — o ramo abaixo é quem publica.
      const timer = setTimeout(() => {
        setResolvedTarget(null);
        setReadyIndex(stepIndex);
      }, DEFAULT_TIMEOUT_MS);

      return () => clearTimeout(timer);
    }

    const controller = new AbortController();

    // As escritas de estado vivem dentro da função assíncrona (mesmo a
    // primeira, antes do primeiro `await`) — é o que faz este efeito
    // sincronizar com um sistema externo (o DOM, via `waitForTarget`) em vez
    // de só ajustar estado a partir de uma dependência que mudou. Também é o
    // que mantém o `setState` fora do corpo síncrono do efeito
    // (`react-hooks/set-state-in-effect`).
    void (async () => {
      // Sem alvo (o convite): nada para esperar no DOM — publica na hora.
      if (!step.target) {
        setResolvedTarget(null);
        setReadyIndex(stepIndex);
        return;
      }

      const primary = await waitForTarget(tourSelector(step.target), {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (primary) {
        scrollTargetIntoView(primary);
        setResolvedTarget(step.target!);
        setReadyIndex(stepIndex);
        return;
      }

      if (step.fallback) {
        const fallback = await waitForTarget(tourSelector(step.fallback), {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (fallback) {
          scrollTargetIntoView(fallback);
          setResolvedTarget(step.fallback);
          setReadyIndex(stepIndex);
          return;
        }
      }

      // Nem o alvo nem o reserva apareceram: o passo segue mesmo assim,
      // centralizado (Decisão 4) — nunca trava, nunca pula sozinho.
      setResolvedTarget(null);
      setReadyIndex(stepIndex);
    })();

    return () => controller.abort();
  }, [step, stepIndex, pathname, router]);

  // Pré-carrega a rota do próximo passo assim que este ficou pronto — com os
  // esqueletos de `loading.tsx` (Fase 1), a troca seguinte já chega quase
  // pronta. Só quando a rota difere da atual: `router.prefetch` da própria
  // rota corrente não faz nada de útil.
  useEffect(() => {
    if (readyIndex === null) return;
    const next: (typeof TOUR_STEPS)[number] | undefined =
      TOUR_STEPS[readyIndex + 1];
    if (next?.route && next.route !== pathname) {
      router.prefetch(next.route);
    }
  }, [readyIndex, pathname, router]);

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

  // O que a tela mostra: o passo já pronto, nunca o que a máquina só
  // "mandou seguir". `resolvedTarget` só é escrito junto de `readyIndex`
  // (acima), então os dois sempre descrevem o mesmo passo — nenhum gate
  // extra é preciso aqui.
  const displayIndex = state.status === "running" ? readyIndex : null;
  const displayStep = displayIndex !== null ? TOUR_STEPS[displayIndex] : null;
  // A máquina já pediu o próximo passo, mas a tela ainda mostra o anterior —
  // é o que mantém o cartão "seguro" no lugar (Fase 3) em vez de anunciar a
  // tela nova antes dela existir.
  const pending = state.status === "running" && stepIndex !== readyIndex;

  const geometry = useTourGeometry(resolvedTarget, state.status === "running");

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
      {displayStep && (
        <>
          <TourSpotlight rect={geometry.rect} viewport={geometry.viewport} />
          <TourCard
            step={displayStep}
            stepNumber={(displayIndex ?? 0) + 1}
            totalSteps={TOTAL_STEPS}
            rect={geometry.rect}
            viewport={geometry.viewport}
            placement={geometry.placement}
            pending={pending}
            onNext={() => dispatch({ type: "next" })}
            onBack={() => dispatch({ type: "back" })}
            onClose={() => dispatch({ type: "close" })}
          />
        </>
      )}
    </TourContext.Provider>
  );
}
