import { regionColor, regionLabel } from "@/lib/round/regions";
import { formatScore } from "@/lib/team/score";
import type { TeamSummary } from "@/lib/team/types";
import { tourTarget, type TourTarget } from "@/lib/tour/targets";
import { cn } from "@/lib/utils";

function Stat({
  label,
  children,
  className,
  tourId,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  tourId?: TourTarget;
}) {
  return (
    <div
      {...(tourId ? tourTarget(tourId) : {})}
      className={cn("p-4 text-center", className)}
    >
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

/** Pontos, estado do mercado e a região deste time. O saldo já aparece no header. */
export function TeamStats({ summary }: { summary: TeamSummary }) {
  const { points, market, region } = summary;

  return (
    <section className="grid grid-cols-1 ring-1 ring-border sm:grid-cols-3">
      <Stat
        label="Pontos"
        className="border-b border-border sm:border-r sm:border-b-0"
      >
        <p className="mt-1 text-xl font-extrabold text-info tabular-nums">
          {formatScore(points)}
        </p>
      </Stat>

      <Stat
        label="Mercado"
        tourId="relogio-mercado"
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
