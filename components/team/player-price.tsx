import { formatCredits } from "@/lib/market/money";
import { cn } from "@/lib/utils";

export type PlayerPriceProps = {
  priceCents: number;
  className?: string;
};

/**
 * Preço de um jogador no catálogo, sempre em créditos com uma casa decimal.
 * Compartilhado entre "Meu Time" e o mercado — nenhum componente formata
 * preço na mão.
 */
export function PlayerPrice({ priceCents, className }: PlayerPriceProps) {
  return (
    <span className={cn("font-bold tabular-nums text-info", className)}>
      {formatCredits(priceCents)}
    </span>
  );
}
