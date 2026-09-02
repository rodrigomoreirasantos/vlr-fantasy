"use client";

import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { formatMarketCountdown } from "@/lib/market/window";

export type MarketCountdownProps = {
  opensAt: Date;
  closesAt: Date;
  /**
   * A frase já formatada no servidor (`formatMarketCountdown`) — usada no
   * primeiro paint. Só depois de montar o componente passa a recalcular e
   * tickar sozinho, o que evita qualquer mismatch entre o HTML do servidor e
   * o do cliente.
   */
  initialCountdown: string;
};

const TICK_MS = 30_000;

/**
 * Contagem regressiva do mercado, resolve o TODO de `lib/team/types.ts`.
 * Mostra os três estados da janela — abre em / fecha em / fechado — pela
 * mesma função pura que o servidor usou, para as duas telas (`/home` e
 * `/my-team`) nunca se contradizerem.
 */
export function MarketCountdown({
  opensAt,
  closesAt,
  initialCountdown,
}: MarketCountdownProps) {
  const [countdown, setCountdown] = useState(initialCountdown);

  useEffect(() => {
    // Só passa a tickar depois de montar — o primeiro paint (e a hidratação)
    // usam exatamente o texto vindo do servidor, sem recálculo imediato.
    const id = setInterval(() => {
      setCountdown(formatMarketCountdown({ opensAt, closesAt }));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [opensAt, closesAt]);

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
