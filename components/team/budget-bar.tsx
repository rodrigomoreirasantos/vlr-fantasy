import { Progress } from "@/components/ui/progress";
import { PlayerPrice } from "@/components/team/player-price";
import { MAX_PATRIMONY_CENTS, patrimonyCents } from "@/lib/market/budget";
import { formatCredits } from "@/lib/market/money";

export type BudgetBarProps = {
  balanceCents: number;
  squadValueCents: number;
  /** O corte do teto na última rodada fechada — `0` sem corte. */
  budgetTrimmedCents: number;
};

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * Saldo, valor do elenco e patrimônio contra o teto (Decisões 1 e 3,
 * `.claude/plans/20-preco-dos-jogadores-e-orcamento.md`) — o que transforma
 * "os 5 mais caros nunca cabem" numa conta visível, não numa regra
 * escondida. Fica em "Meu Time", acima do tabuleiro (`FormationBoard`).
 */
export function BudgetBar({
  balanceCents,
  squadValueCents,
  budgetTrimmedCents,
}: BudgetBarProps) {
  const patrimony = patrimonyCents({ balanceCents, squadValueCents });
  // O patrimônio pode superar o teto por um instante entre o fechamento de
  // uma rodada e o corte ser aplicado em produção — a barra nunca extrapola.
  const clampedPatrimony = Math.min(patrimony, MAX_PATRIMONY_CENTS);

  return (
    <section className="clip-corner mb-6 bg-secondary p-4 ring-1 ring-border [--clip:10px]">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Saldo">
          <PlayerPrice priceCents={balanceCents} className="text-lg" />
        </Stat>
        <Stat label="Valor do elenco">
          <PlayerPrice priceCents={squadValueCents} className="text-lg" />
        </Stat>
        <Stat label="Patrimônio">
          <p className="tabular-nums">
            <span className="text-lg font-bold text-info">
              {formatCredits(patrimony)}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {" "}
              / {formatCredits(MAX_PATRIMONY_CENTS)}
            </span>
          </p>
        </Stat>
      </div>

      <Progress
        value={clampedPatrimony}
        max={MAX_PATRIMONY_CENTS}
        aria-label="Patrimônio contra o teto"
        className="mt-3"
      />

      {budgetTrimmedCents > 0 && (
        <p className="mt-2 text-[11px] font-semibold text-destructive">
          Seu teto de {formatCredits(MAX_PATRIMONY_CENTS)} cr cortou{" "}
          {formatCredits(budgetTrimmedCents)} cr nesta rodada.
        </p>
      )}
    </section>
  );
}
