import Link from "next/link";

import { formatScore } from "@/lib/team/score";
import type { ChampionshipSummary } from "@/lib/championship/types";

export type ChampionshipPlacement = {
  championship: ChampionshipSummary;
  /** Posição do usuário na classificação (`rankStandings`), 1-based. */
  position: number;
  points: number;
  /**
   * Variação de posição em relação à rodada anterior (`previous - current`):
   * positivo subiu, negativo desceu, `null` sem comparação — a Home
   * (`components/home/round-recap.tsx`) é quem preenche isto; `/profile`
   * passa `null` e mantém a aparência de sempre.
   */
  change?: number | null;
};

export type ChampionshipPlacementsProps = {
  placements: ChampionshipPlacement[];
};

/** "↑1" subiu, "↓2" desceu, "—" manteve ou sem rodada anterior para comparar. */
function formatPlacementChange(change: number): string {
  if (change > 0) return `↑${change}`;
  if (change < 0) return `↓${Math.abs(change)}`;
  return "—";
}

/** A seta sozinha não diz nada num leitor de tela — este é o rótulo dela. */
function placementChangeLabel(change: number): string {
  if (change > 0) return `Subiu ${change} posição(ões)`;
  if (change < 0) return `Caiu ${Math.abs(change)} posição(ões)`;
  return "Manteve a posição";
}

/** Resumo das colocações do usuário em cada campeonato, linkando para `/ranking?c=<id>`. */
export function ChampionshipPlacements({
  placements,
}: ChampionshipPlacementsProps) {
  if (placements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Você ainda não está em nenhum campeonato.{" "}
        <Link
          href="/ranking"
          className="text-primary underline underline-offset-4"
        >
          Ver campeonatos
        </Link>
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {placements.map(({ championship, position, points, change }) => (
        <li key={championship.id}>
          <Link
            href={`/ranking?c=${championship.id}`}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5 transition-colors hover:border-ring"
          >
            <span className="text-sm font-semibold">{championship.name}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{position}º</span>
              de {championship.memberCount}
              {change !== undefined && (
                <span
                  aria-label={placementChangeLabel(change ?? 0)}
                  className="font-bold tabular-nums text-foreground"
                >
                  {formatPlacementChange(change ?? 0)}
                </span>
              )}
              <span aria-hidden>·</span>
              <span className="font-bold tabular-nums text-info">
                {formatScore(points)}
              </span>
              pts
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
