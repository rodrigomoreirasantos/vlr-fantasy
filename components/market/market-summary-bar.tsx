import { PlayerPrice } from "@/components/team/player-price";
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
  closesIn: string;
};

/** Saldo, quem sai da escalação (ou a vaga sendo preenchida) e a janela de mercado. */
export function MarketSummaryBar({
  balanceCents,
  outgoing,
  position,
  marketOpen,
  closesIn,
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
      </Stat>

      <Stat label="Mercado">
        <p
          className={cn(
            "text-sm font-bold uppercase",
            marketOpen ? "text-primary" : "text-muted-foreground",
          )}
        >
          {marketOpen ? closesIn : "Fechado"}
        </p>
      </Stat>
    </div>
  );
}
