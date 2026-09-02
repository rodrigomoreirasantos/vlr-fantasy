import { Badge } from "@/components/ui/badge";
import { formatMatchKickoff } from "@/lib/round/format";
import type { RoundMatch } from "@/lib/round/types";
import { cn } from "@/lib/utils";

export type MatchListProps = {
  matches: RoundMatch[];
  /** Organizações dos seus 5 jogadores — destaca a partida deles na lista. */
  myOrganizations: readonly string[];
};

/** Calendário oficial da próxima rodada — todas as partidas, com destaque nas dos seus 5. */
export function MatchList({ matches, myOrganizations }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhuma partida marcada para a próxima rodada.
      </p>
    );
  }

  const mine = new Set(myOrganizations);

  return (
    <ul className="flex flex-col gap-2">
      {matches.map((match) => {
        const involvesMyPlayer = mine.has(match.teamA) || mine.has(match.teamB);

        return (
          <li
            key={match.id}
            className={cn(
              "clip-corner flex flex-wrap items-center justify-between gap-2 bg-secondary px-3 py-2.5 ring-1 [--clip:8px]",
              involvesMyPlayer ? "ring-primary/40" : "ring-border",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase">
                {match.teamA} <span className="text-muted-foreground">×</span>{" "}
                {match.teamB}
              </span>
              {involvesMyPlayer && (
                <Badge variant="outline" className="text-[10px]">
                  Seu jogador
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {match.event} · {formatMatchKickoff(match.scheduledAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
