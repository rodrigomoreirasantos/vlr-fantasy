"use client";

import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { formatMarketClose } from "@/lib/market/window";
import { cn } from "@/lib/utils";

export type MarketCountdownProps = {
  /** Uma hora antes do primeiro jogo do dia — `nextMarketClose`. */
  closesAt: Date;
  /**
   * A frase já formatada no servidor (`formatMarketClose` ou o `formatter`
   * passado) — usada no primeiro paint. Só depois de montar o componente
   * passa a recalcular e tickar sozinho, o que evita qualquer mismatch entre
   * o HTML do servidor e o do cliente.
   */
  initialCountdown: string;
  /**
   * A função que traduz `closesAt` em texto a cada tick — default
   * `formatMarketClose` ("Mercado fecha em 7h 0m"). A `MarketSummaryBar`
   * passa `formatTimeLeft` ("7h 0m"): o rótulo "Mercado" já está no cabeçalho
   * do card, e repetir a palavra seria ruído.
   */
  formatter?: (closesAt: Date, now?: Date) => string;
  className?: string;
};

const TICK_MS = 30_000;

/**
 * Contagem regressiva do mercado, pela mesma função pura que o servidor usou
 * — é o que garante que o primeiro paint e o tick seguinte não se
 * contradigam.
 */
export function MarketCountdown({
  closesAt,
  initialCountdown,
  formatter = formatMarketClose,
  className,
}: MarketCountdownProps) {
  // O tick guarda **de qual** frase do servidor ele derivou. Assim o texto
  // exibido é derivado no render, não sincronizado por efeito: uma frase nova
  // do servidor vence na hora, e o tick só sobrevive enquanto continuar
  // falando da mesma.
  //
  // Isso importa dentro do `MarketSheet`: ele monta com a frase da página
  // (que pode estar parada há vinte minutos) e só depois `loadMarket` traz a
  // do servidor. Deixar a nova esperar o primeiro tick seriam 30s — mais do
  // que a maioria das visitas ao modal dura.
  const [ticked, setTicked] = useState<{ base: string; text: string } | null>(
    null,
  );
  const countdown =
    ticked?.base === initialCountdown ? ticked.text : initialCountdown;

  useEffect(() => {
    // Só passa a tickar depois de montar — o primeiro paint (e a hidratação)
    // usam exatamente o texto vindo do servidor, sem recálculo imediato.
    const id = setInterval(() => {
      setTicked({ base: initialCountdown, text: formatter(closesAt) });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [closesAt, formatter, initialCountdown]);

  return (
    <p
      className={cn(
        "text-base font-extrabold text-primary uppercase",
        className,
      )}
    >
      {/* Com `dateTime` presente, o conteúdo do `<time>` pode ser a frase
          inteira em linguagem natural — a data legível por máquina vai no
          atributo. */}
      <time
        dateTime={dayjs(closesAt).toISOString()}
        aria-live="off"
        className="tabular-nums"
      >
        {countdown}
      </time>
    </p>
  );
}
