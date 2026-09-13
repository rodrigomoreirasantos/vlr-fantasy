import { tourTarget, type TourTarget } from "@/lib/tour/targets";
import { cn } from "@/lib/utils";

export type PanelProps = {
  title: string;
  /**
   * Controles que qualificam o painel — filtros, seletores. Ficam à direita do
   * título porque é o título que eles qualificam; soltos no corpo, o leitor
   * teria de adivinhar sobre o que agem.
   */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Alvo do tour guiado (`lib/tour/`) — quando este painel é um dos passos. */
  tourId?: TourTarget;
};

/** Cartão chanfrado com um título em caixa alta — moldura das seções de "Meu Time". */
export function Panel({ title, actions, children, className, tourId }: PanelProps) {
  return (
    <section
      {...(tourId ? tourTarget(tourId) : {})}
      className={cn(
        "clip-corner bg-card p-[18px] ring-1 ring-border [--clip:16px]",
        className,
      )}
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
