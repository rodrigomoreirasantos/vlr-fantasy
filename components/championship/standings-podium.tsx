import { TeamCrest } from "@/components/crest/team-crest";
import {
  splitPodium,
  type PodiumEntry,
  type PodiumPlace,
} from "@/lib/championship/standings";
import type { RankedStanding } from "@/lib/championship/types";
import { formatScore } from "@/lib/team/score";
import { cn } from "@/lib/utils";

export type StandingsPodiumProps = {
  standings: RankedStanding[];
};

/**
 * No mobile a ordem do DOM já é 1º → 2º → 3º (linhas empilhadas, 1º
 * primeiro); a partir de `sm` a única mudança é a posição visual, com o 1º
 * ao centro.
 */
const ORDER_CLASS: Record<PodiumPlace, string> = {
  1: "sm:order-2",
  2: "sm:order-1",
  3: "sm:order-3",
};

function tiedLabel(count: number) {
  return `+${count} ${count === 1 ? "empatado" : "empatados"}`;
}

/**
 * Abaixo de `sm`, uma linha compacta (posição · brasão · time · pontos) —
 * três cards altos e centralizados tomavam a tela inteira do celular. De
 * `sm` em diante, a coluna centralizada do pódio.
 */
function PodiumCard({ entry }: { entry: PodiumEntry }) {
  const { place, standing, tiedCount } = entry;
  const isFirst = place === 1;

  return (
    <div
      className={cn(
        "clip-corner flex items-center gap-3 bg-secondary px-3 py-2.5 ring-1 [--clip:12px]",
        "sm:flex-1 sm:flex-col sm:gap-1.5 sm:p-4 sm:text-center",
        ORDER_CLASS[place],
        isFirst ? "ring-primary/50 sm:pb-5" : "ring-border",
        standing.isCurrentUser && "ring-2 ring-primary",
      )}
    >
      <span
        className={cn(
          "w-7 shrink-0 text-center text-sm font-extrabold tracking-wide sm:w-auto sm:text-xs",
          isFirst ? "text-primary" : "text-muted-foreground",
        )}
      >
        {place}º
      </span>
      <TeamCrest
        crest={standing.crest}
        size={isFirst ? "podium" : "md"}
        title={`Brasão de ${standing.teamName}`}
        // O `size` vira width/height inline; no celular a linha é baixa, então
        // o brasão encolhe com `!important` só abaixo de `sm`.
        className={isFirst ? "max-sm:size-11!" : "max-sm:size-9!"}
      />
      <span className="flex min-w-0 flex-1 flex-col sm:max-w-full sm:flex-none sm:items-center">
        <span
          className={cn(
            "truncate text-sm font-extrabold uppercase",
            standing.isCurrentUser && "text-primary",
          )}
        >
          {standing.teamName}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {standing.username ? `@${standing.username}` : "—"}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 sm:items-center">
        <span className="text-base font-black tabular-nums text-info sm:text-lg">
          {formatScore(standing.points)}
        </span>
        {standing.isCurrentUser && (
          <span className="text-[10px] font-bold uppercase text-primary">
            Você
          </span>
        )}
        {tiedCount > 0 && (
          <span className="text-[11px] font-semibold text-muted-foreground">
            {tiedLabel(tiedCount)}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * O pódio (posições 1 a 3) do campeonato selecionado — plano 28, Fase 4,
 * Decisão D3. Recebe a classificação inteira e separa sozinho com
 * `splitPodium`, a mesma função que `StandingsList` usa — as duas nunca
 * divergem sobre quem está em qual lugar.
 *
 * Um card por posição: empatados ficam na lista, e o card avisa "+N
 * empatados". Com todo mundo empatado, não há pódio.
 */
export function StandingsPodium({ standings }: StandingsPodiumProps) {
  const { podium } = splitPodium(standings);
  if (podium.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-end sm:gap-4">
      {podium.map((entry) => (
        <PodiumCard key={entry.place} entry={entry} />
      ))}
    </div>
  );
}
