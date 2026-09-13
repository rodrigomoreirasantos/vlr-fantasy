import { Progress } from "@/components/ui/progress";
import { PlayerPrice } from "@/components/team/player-price";
import { DREAM_TEAM_CENTS, dreamTeamGapCents, patrimonyCents } from "@/lib/market/budget";
import { formatCredits } from "@/lib/market/money";
import { tourTarget } from "@/lib/tour/targets";
import { cn } from "@/lib/utils";

export type BudgetBarProps = {
  balanceCents: number;
  squadValueCents: number;
  /** Ganho/perda da última rodada fechada — `null` sem rodada fechada ainda. */
  lastSquadValuationCents: number | null;
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
 * Saldo, valor do elenco e patrimônio rumo ao time dos sonhos
 * (`.claude/plans/26-regras-de-preco-e-saldo.md`) — sem teto de patrimônio
 * (Suposição S3): o usuário **pode** escalar os 5 jogadores mais caros,
 * desde que junte dinheiro para isso. Fica em "Meu Time", acima do
 * tabuleiro (`FormationBoard`).
 */
export function BudgetBar({
  balanceCents,
  squadValueCents,
  lastSquadValuationCents,
}: BudgetBarProps) {
  const patrimony = patrimonyCents({ balanceCents, squadValueCents });
  const gapCents = dreamTeamGapCents({ balanceCents, squadValueCents });
  // A barra nunca extrapola: patrimônio acima do time dos sonhos preenche 100%.
  const clampedPatrimony = Math.min(patrimony, DREAM_TEAM_CENTS);

  return (
    <section
      {...tourTarget("orcamento")}
      className="clip-corner mb-6 bg-secondary p-4 ring-1 ring-border [--clip:10px]"
    >
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
          </p>
        </Stat>
      </div>

      <Progress
        value={clampedPatrimony}
        max={DREAM_TEAM_CENTS}
        aria-label="Patrimônio rumo ao time dos sonhos"
        className="mt-3"
      />

      <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
        {gapCents > 0
          ? `Faltam ${formatCredits(gapCents)} cr para poder escalar os 5 mais caros.`
          : "Você já pode escalar os 5 mais caros."}
      </p>

      {lastSquadValuationCents !== null && lastSquadValuationCents !== 0 && (
        <p
          className={cn(
            "mt-1 text-[11px] font-semibold",
            lastSquadValuationCents < 0 ? "text-destructive" : "text-success",
          )}
        >
          Última rodada: sua escalação{" "}
          {lastSquadValuationCents < 0 ? "desvalorizou" : "valorizou"}{" "}
          {formatCredits(Math.abs(lastSquadValuationCents))} cr.
        </p>
      )}
    </section>
  );
}
