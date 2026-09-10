import { MarketCountdown } from "@/components/market/market-countdown";
import { PlayerPrice } from "@/components/team/player-price";
import { spendingCapCents } from "@/lib/market/eligibility";
import { formatCreditsDelta } from "@/lib/market/money";
import { formatTimeLeft } from "@/lib/market/window";
import type { Player } from "@/lib/team/types";
import { cn } from "@/lib/utils";

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-2.5 text-center">
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
 * Saldo, o teto de compra desta troca e a janela de mercado — o número da
 * vaga já está no `<SheetDescription>` do Sheet, não repetido aqui.
 *
 * Numa substituição, o teto (`spendingCapCents`) é o saldo mais o preço de
 * quem sai — é a mesma conta que `evaluateSubstitution` usa para decidir
 * "Sem saldo" em cada card, então bate exatamente com o que aparece bloqueado
 * lá embaixo. Numa vaga vazia o teto é igual ao saldo, e a célula do meio
 * some — mostrar o mesmo número duas vezes seria ruído.
 */
export function MarketSummaryBar({
  balanceCents,
  outgoing,
  marketOpen,
  closesIn,
  closesAt,
}: MarketSummaryBarProps) {
  const showCap = outgoing !== null;

  return (
    <div
      className={cn(
        "clip-corner grid ring-1 ring-border [&>*+*]:border-l [&>*+*]:border-border [--clip:10px]",
        showCap ? "grid-cols-3" : "grid-cols-2",
      )}
    >
      <Stat label="Saldo">
        <PlayerPrice priceCents={balanceCents} className="text-base" />
      </Stat>

      {outgoing && (
        <Stat label="Pode gastar">
          <PlayerPrice
            priceCents={spendingCapCents(balanceCents, outgoing)}
            className="text-base"
          />
          <p className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground tabular-nums">
            {formatCreditsDelta(outgoing.priceCents)} com {outgoing.nickname}
          </p>
        </Stat>
      )}

      <Stat label={marketOpen && closesAt ? "Fecha em" : "Mercado"}>
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
