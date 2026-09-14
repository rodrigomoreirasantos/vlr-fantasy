import { TeamCrest } from "@/components/crest/team-crest";
import { PODIUM_SIZE } from "@/lib/championship/standings";
import type { RankedStanding } from "@/lib/championship/types";
import { formatScore } from "@/lib/team/score";
import { cn } from "@/lib/utils";

export type StandingsPodiumProps = {
  standings: RankedStanding[];
};

type Place = 1 | 2 | 3;

/**
 * No mobile a ordem do DOM já é 1º → 2º → 3º (empilhados, 1º primeiro — "1º
 * maior" do plano 28, D3); a partir de `sm` a única mudança é a posição
 * visual, com o 1º ao centro.
 */
const ORDER_CLASS: Record<Place, string> = {
  1: "sm:order-2",
  2: "sm:order-1",
  3: "sm:order-3",
};

function PodiumEntry({
  standing,
  place,
}: {
  standing: RankedStanding;
  place: Place;
}) {
  const isFirst = place === 1;

  return (
    <div
      className={cn(
        "clip-corner flex flex-col items-center gap-1.5 bg-card p-4 text-center ring-1 [--clip:14px]",
        isFirst ? "pb-5 ring-primary/50" : "ring-border",
        standing.isCurrentUser && "ring-2 ring-primary",
      )}
    >
      <span
        className={cn(
          "text-xs font-extrabold tracking-wide",
          isFirst ? "text-primary" : "text-muted-foreground",
        )}
      >
        {place}º
      </span>
      <TeamCrest
        crest={standing.crest}
        size={isFirst ? "podium" : "md"}
        title={`Brasão de ${standing.teamName}`}
      />
      <span
        className={cn(
          "max-w-full truncate text-sm font-extrabold uppercase",
          standing.isCurrentUser && "text-primary",
        )}
      >
        {standing.teamName}
      </span>
      <span className="max-w-full truncate text-xs text-muted-foreground">
        {standing.username ? `@${standing.username}` : "—"}
      </span>
      <span className="text-lg font-black tabular-nums text-info">
        {formatScore(standing.points)}
      </span>
      {standing.isCurrentUser && (
        <span className="text-[10px] font-bold uppercase text-primary">
          Você
        </span>
      )}
    </div>
  );
}

/**
 * O pódio (posições 1 a 3) do campeonato selecionado — plano 28, Fase 4,
 * Decisão D3. Recebe a classificação inteira e filtra sozinho: quem chama
 * (`/ranking`) passa o mesmo array para `StandingsPodium` e `StandingsList`,
 * sem duplicar a filtragem.
 *
 * Empate divide a mesma posição (`rankStandings`) — cada coluna pode ter
 * mais de um time; a coluna correspondente simplesmente empilha os
 * empatados. Com menos de 3 membros no campeonato, só as colunas que
 * existem aparecem.
 */
export function StandingsPodium({ standings }: StandingsPodiumProps) {
  const podium = standings.filter((row) => row.position <= PODIUM_SIZE);
  if (podium.length === 0) return null;

  const groups = ([1, 2, 3] as const)
    .map((place) => ({
      place,
      members: podium.filter((row) => row.position === place),
    }))
    .filter((group) => group.members.length > 0);

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      {groups.map(({ place, members }) => (
        <div
          key={place}
          className={cn("flex flex-1 flex-col gap-3", ORDER_CLASS[place])}
        >
          {members.map((standing) => (
            <PodiumEntry key={standing.userId} standing={standing} place={place} />
          ))}
        </div>
      ))}
    </div>
  );
}
