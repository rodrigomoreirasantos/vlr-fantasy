import Link from "next/link";

import { formatScore } from "@/lib/team/score";
import type { ChampionshipSummary } from "@/lib/championship/types";

export type ChampionshipPlacement = {
  championship: ChampionshipSummary;
  /** Posição do usuário na classificação (`rankStandings`), 1-based. */
  position: number;
  points: number;
};

export type ChampionshipPlacementsProps = {
  placements: ChampionshipPlacement[];
};

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
      {placements.map(({ championship, position, points }) => (
        <li key={championship.id}>
          <Link
            href={`/ranking?c=${championship.id}`}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5 transition-colors hover:border-ring"
          >
            <span className="text-sm font-semibold">{championship.name}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{position}º</span>
              de {championship.memberCount}
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
