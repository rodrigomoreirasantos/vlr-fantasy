import { MatchRow } from "@/components/home/match-row";
import { formatMatchKickoff } from "@/lib/round/format";
import type { RoundMatch } from "@/lib/round/types";

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
      {matches.map((match) => (
        <MatchRow
          key={match.id}
          match={match}
          mine={mine.has(match.teamA) || mine.has(match.teamB)}
          trailing={
            <span className="text-xs text-muted-foreground">
              {match.event} · {formatMatchKickoff(match.scheduledAt)}
            </span>
          }
        />
      ))}
    </ul>
  );
}
