import { MarketCountdown } from "@/components/market/market-countdown";
import { PlayerPrice } from "@/components/team/player-price";
import { formatCreditsDelta } from "@/lib/market/money";
import { formatTimeLeft } from "@/lib/market/window";
import type { Player } from "@/lib/team/types";
import { cn } from "@/lib/utils";

function Stat({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("p-2.5 text-center", className)}>
      <p className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

export type MarketSummaryBarProps = {
  balanceCents: number;
  /** `null` numa vaga vazia — não há ninguém saindo da escalação. */
  outgoing: Player | null;
  /** Número da vaga (1-5), usado no lugar do nickname quando `outgoing` é `null`. */
  position: number;
  marketOpen: boolean;
  /** A frase já formatada no servidor — usada como `initialCountdown` do `<MarketCountdown>`. */
  closesIn: string;
  /**
   * O instante de fechamento — recortado pela região do time
   * (`marketMatchesFor`, `lib/market/window.ts`), nunca o de outro
   * campeonato. `null` sem jogo marcado ou sem rodada ativa: aí `closesIn`
   * já traz a frase certa ("Nenhum jogo marcado" / "Nenhuma rodada ativa"),
   * e não há o que tickar.
   */
  closesAt: Date | null;
};

/**
 * Saldo, quem sai da escalação (ou a vaga sendo preenchida) e a janela de
 * mercado. Numa substituição, o crédito que a saída de `outgoing` gera
 * aparece aqui, uma única vez — é o único lugar que mostra esse abatimento;
 * os cards de candidato (`MarketPlayerRow`) mostram só o preço cheio.
 */
export function MarketSummaryBar({
  balanceCents,
  outgoing,
  position,
  marketOpen,
  closesIn,
  closesAt,
}: MarketSummaryBarProps) {
  return (
    <div className="clip-corner grid grid-cols-3 ring-1 ring-border [--clip:10px]">
      <Stat label="Saldo" className="border-r border-border">
        <PlayerPrice priceCents={balanceCents} className="text-base" />
      </Stat>

      <Stat
        label={outgoing ? "Sai" : "Vaga"}
        className="border-r border-border"
      >
        <p className="truncate text-sm font-bold uppercase">
          {outgoing ? outgoing.nickname : position}
        </p>
        {outgoing && (
          <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
            {formatCreditsDelta(outgoing.priceCents)}
          </p>
        )}
      </Stat>

      <Stat label="Mercado">
        {marketOpen && closesAt ? (
          <MarketCountdown
            closesAt={closesAt}
            initialCountdown={closesIn}
            formatter={formatTimeLeft}
            className="text-sm font-bold text-primary"
          />
        ) : (
          <p
            className={cn(
              "text-sm font-bold uppercase",
              marketOpen ? "text-primary" : "text-muted-foreground",
            )}
          >
            {marketOpen ? closesIn : "Fechado"}
          </p>
        )}
      </Stat>
    </div>
  );
}
