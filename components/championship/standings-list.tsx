import { TeamCrest } from "@/components/crest/team-crest";
import { splitPodium } from "@/lib/championship/standings";
import type { RankedStanding } from "@/lib/championship/types";
import { formatScore } from "@/lib/team/score";
import { cn } from "@/lib/utils";

export type StandingsListProps = {
  standings: RankedStanding[];
};

/**
 * Quem não está no pódio — do 4º em diante e os empatados com quem está no
 * pódio (`splitPodium`). Com todo mundo empatado não há pódio, e a lista
 * mostra o campeonato inteiro. Substitui a antiga `StandingsTable` (tabela)
 * por uma lista de cards chanfrados, que cabe melhor em telas estreitas
 * (plano 28, Fase 4).
 *
 * A posição de cada linha é a real (`rankStandings`): um empatado em 2º
 * aparece aqui como "2". Só a linha do usuário atual é destacada.
 */
export function StandingsList({ standings }: StandingsListProps) {
  const { rest } = splitPodium(standings);
  if (rest.length === 0) return null;

  return (
    <ol className="flex flex-col gap-2">
      {rest.map((row) => (
        <li
          key={row.userId}
          className={cn(
            "clip-corner flex items-center gap-3 bg-secondary px-3 py-2.5 ring-1 [--clip:10px]",
            row.isCurrentUser ? "ring-primary/50" : "ring-border",
          )}
        >
          <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-muted-foreground">
            {row.position}
          </span>
          <TeamCrest
            crest={row.crest}
            size="sm"
            title={`Brasão de ${row.teamName}`}
          />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "flex items-center gap-1.5 truncate text-sm font-semibold uppercase",
                row.isCurrentUser && "text-primary",
              )}
            >
              <span className="truncate">{row.teamName}</span>
              {row.isCurrentUser && (
                <span className="shrink-0 text-[10px] font-bold uppercase text-primary">
                  Você
                </span>
              )}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.username ? `@${row.username}` : "—"}
            </span>
          </span>
          <span className="shrink-0 text-right text-sm font-bold tabular-nums text-info">
            {formatScore(row.points)}
          </span>
        </li>
      ))}
    </ol>
  );
}
