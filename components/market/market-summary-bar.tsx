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
  outgoing: Player;
  marketOpen: boolean;
  closesIn: string;
};

/** Saldo, quem sai da escalação e o estado da janela de mercado. */
export function MarketSummaryBar({
  balanceCents,
  outgoing,
  marketOpen,
  closesIn,
}: MarketSummaryBarProps) {
  return (
    <div className="clip-corner grid grid-cols-3 ring-1 ring-border [--clip:10px]">
      <Stat label="Saldo" className="border-r border-border">
        <PlayerPrice priceCents={balanceCents} className="text-base" />
      </Stat>

      <Stat label="Sai" className="border-r border-border">
        <p className="truncate text-sm font-bold uppercase">{outgoing.nickname}</p>
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
