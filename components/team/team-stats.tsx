import { formatCredits } from "@/lib/market/money";
import { regionColor, regionLabel } from "@/lib/round/regions";
import type { TeamSummary } from "@/lib/team/types";
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
    <div className={cn("p-4 text-center", className)}>
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

/** Saldo, estado do mercado e a região deste time. */
export function TeamStats({ summary }: { summary: TeamSummary }) {
  const { balanceCents, market, region } = summary;

  return (
    <section className="grid grid-cols-1 ring-1 ring-border sm:grid-cols-3">
      <Stat
        label="Saldo"
        className="border-b border-border sm:border-r sm:border-b-0"
      >
        <p className="mt-1 text-xl font-extrabold text-info tabular-nums">
          {formatCredits(balanceCents)}
        </p>
      </Stat>

      <Stat
        label="Mercado"
        className="border-b border-border sm:border-r sm:border-b-0"
      >
        <p
          className={cn(
            "mt-1 text-base font-extrabold uppercase",
            market.open ? "text-primary" : "text-muted-foreground",
          )}
        >
          {market.open ? "Aberto agora" : "Fechado"}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
          {market.closesIn}
        </p>
      </Stat>

      <Stat label="Região">
        <p
          className="mt-1 text-xl font-extrabold uppercase"
          style={{ color: regionColor(region) }}
        >
          {regionLabel(region)}
        </p>
      </Stat>
    </section>
  );
}
