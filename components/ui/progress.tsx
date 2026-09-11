"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  // `max` default 100, como o Radix — mas respeitado de verdade no cálculo
  // do preenchimento abaixo. O componente gerado pelo shadcn assumia
  // `value` sempre 0-100 e ignorava `max`; o `BudgetBar` (Decisão 3, plano
  // 20) precisa de uma escala em centavos, então o bug tinha de ser
  // corrigido aqui, não contornado no chamador.
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const percent = max > 0 ? ((value ?? 0) / max) * 100 : 0;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
