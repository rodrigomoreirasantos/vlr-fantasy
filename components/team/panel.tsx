import { cn } from "@/lib/utils";

export type PanelProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

/** Cartão chanfrado com um título em caixa alta — moldura das seções de "Meu Time". */
export function Panel({ title, children, className }: PanelProps) {
  return (
    <section
      className={cn(
        "clip-corner bg-card p-[18px] ring-1 ring-border [--clip:16px]",
        className,
      )}
    >
      <h2 className="mb-3.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
