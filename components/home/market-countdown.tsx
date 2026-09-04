"use client";

import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { formatMarketClose } from "@/lib/market/window";

export type MarketCountdownProps = {
  /** Uma hora antes do primeiro jogo do dia — `nextMarketClose`. */
  closesAt: Date;
  /**
   * A frase já formatada no servidor (`formatMarketClose`) — usada no
   * primeiro paint. Só depois de montar o componente passa a recalcular e
   * tickar sozinho, o que evita qualquer mismatch entre o HTML do servidor e
   * o do cliente.
   */
  initialCountdown: string;
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
}: MarketCountdownProps) {
  const [countdown, setCountdown] = useState(initialCountdown);

  useEffect(() => {
    // Só passa a tickar depois de montar — o primeiro paint (e a hidratação)
    // usam exatamente o texto vindo do servidor, sem recálculo imediato.
    const id = setInterval(() => {
      setCountdown(formatMarketClose(closesAt));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [closesAt]);

  return (
    <p className="text-base font-extrabold text-primary uppercase">
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
