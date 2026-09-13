"use client";

import { useEffect, useRef } from "react";
import { Loader2Icon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Rect } from "@/lib/tour/geometry";
import type { TourStep } from "@/lib/tour/steps";

/** Altura aproximada do cartão — só usada para centralizar/dockar via `sideOffset`. */
const CARD_HEIGHT_ESTIMATE = 220;
const DOCK_MARGIN = 16;
const DEFAULT_SIDE_OFFSET = 8;

export type TourCardProps = {
  step: TourStep;
  stepNumber: number;
  totalSteps: number;
  rect: Rect | null;
  viewport: { width: number; height: number };
  placement: "bottom" | "top" | "docked" | "center";
  /**
   * A máquina já mandou seguir para o próximo passo, mas a tela dele ainda
   * não está pronta (plano 27, Fase 3 — `.claude/plans/27-tour-passo-a-passo.md`).
   * O cartão continua mostrando `step` (o passo anterior, ainda válido) —
   * só o botão de avançar entra em estado de espera; título, texto e "N de
   * M" nunca mudam por causa disto.
   */
  pending: boolean;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
};

function toDomRect(rect: Rect): DOMRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON() {
      return this;
    },
  };
}

/**
 * O cartão do tour — um `Popover` sempre aberto e `modal`, ancorado num
 * ponto virtual (`PopoverAnchor virtualRef`) em vez de um elemento real: o
 * mesmo mecanismo serve os quatro `placement`s.
 *
 * `bottom`/`top` ancoram no retângulo real do alvo. `docked` ancora num
 * ponto no rodapé da viewport com `side="top"`, o que naturalmente encosta o
 * cartão perto do fim da tela. `center` ancora no meio da viewport com um
 * `sideOffset` negativo de metade da altura estimada do cartão — o truque
 * que centraliza sem brigar com o posicionamento por lado do Radix.
 */
export function TourCard({
  step,
  stepNumber,
  totalSteps,
  rect,
  viewport,
  placement,
  pending,
  onNext,
  onBack,
  onClose,
}: TourCardProps) {
  const isFirst = stepNumber === 1;
  const isLast = stepNumber === totalSteps;
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  // O `Popover` fica sempre `open`: ele nunca fecha e reabre entre passos, só
  // troca de conteúdo. `onOpenAutoFocus` (abaixo) só dispara na primeira
  // montagem — este efeito é quem refoca "Próximo"/"Concluir" a cada troca
  // de passo de verdade.
  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [step.id]);

  // Identidade estável entre renders: o Radix só remede quando ESTE método
  // é chamado de novo (a cada tick de posicionamento dele), não a cada
  // render do React — por isso os valores de verdade vêm de refs, mantidas
  // em dia num efeito (nunca escritas durante a renderização).
  const rectRef = useRef(rect);
  const viewportRef = useRef(viewport);
  const placementRef = useRef(placement);
  useEffect(() => {
    rectRef.current = rect;
    viewportRef.current = viewport;
    placementRef.current = placement;
  });

  const anchorRef = useRef({
    getBoundingClientRect: (): DOMRect => {
      const currentPlacement = placementRef.current;
      const currentRect = rectRef.current;
      const currentViewport = viewportRef.current;

      if (
        currentRect &&
        (currentPlacement === "bottom" || currentPlacement === "top")
      ) {
        return toDomRect(currentRect);
      }
      if (currentPlacement === "docked") {
        return toDomRect({
          top: currentViewport.height,
          left: currentViewport.width / 2,
          width: 0,
          height: 0,
        });
      }
      return toDomRect({
        top: currentViewport.height / 2,
        left: currentViewport.width / 2,
        width: 0,
        height: 0,
      });
    },
  });

  const side =
    placement === "top" || placement === "docked" ? "top" : "bottom";
  const sideOffset =
    placement === "docked"
      ? DOCK_MARGIN
      : placement === "center"
        ? -(CARD_HEIGHT_ESTIMATE / 2)
        : DEFAULT_SIDE_OFFSET;

  return (
    <Popover open modal>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        side={side}
        sideOffset={sideOffset}
        align="center"
        collisionPadding={16}
        aria-labelledby="tour-card-title"
        aria-describedby="tour-card-body"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={onClose}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nextButtonRef.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") onNext();
          if (event.key === "ArrowLeft" && !isFirst) onBack();
        }}
        className="z-[60] w-[min(20rem,calc(100vw-2rem))] clip-corner gap-0 bg-popover p-4 ring-1 ring-border [--clip:12px]"
      >
        <div aria-live="polite">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              <span className="text-primary tabular-nums">{stepNumber}</span>{" "}
              de {totalSteps}
            </p>
            <button
              type="button"
              aria-label="Fechar tutorial"
              onClick={onClose}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div aria-hidden className="mb-3 flex gap-1">
            {Array.from({ length: totalSteps }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  index < stepNumber ? "bg-primary" : "bg-border",
                )}
              />
            ))}
          </div>

          <h2 id="tour-card-title" className="text-base font-extrabold uppercase">
            {step.title}
          </h2>
          <p id="tour-card-body" className="mt-1 text-sm text-muted-foreground">
            {step.body}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {isFirst ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Agora não
              </Button>
              <Button
                type="button"
                ref={nextButtonRef}
                onClick={onNext}
                disabled={pending}
                aria-busy={pending}
              >
                {pending && (
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                )}
                Começar
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Pular tutorial
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onBack}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  ref={nextButtonRef}
                  onClick={onNext}
                  disabled={pending}
                  aria-busy={pending}
                >
                  {pending && (
                    <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  )}
                  {isLast ? "Concluir" : "Próximo"}
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
