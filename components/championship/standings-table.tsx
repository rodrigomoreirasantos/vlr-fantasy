import { TeamCrest } from "@/components/crest/team-crest";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PODIUM_SIZE, standingZone } from "@/lib/championship/standings";
import { formatScore } from "@/lib/team/score";
import { cn } from "@/lib/utils";
import type { RankedStanding } from "@/lib/championship/types";

export type StandingsTableProps = {
  standings: RankedStanding[];
};

/**
 * Tabela de classificação de um campeonato. A linha do usuário se destaca
 * com um anel; separadamente, os 3 primeiros ganham a faixa de pódio
 * (`standingZone`) — 1º em `primary`, 2º e 3º em `success`, com uma
 * divisória logo depois. A faixa só aparece com mais de `PODIUM_SIZE`
 * membros; com menos, destacar todo mundo não distingue ninguém.
 */
export function StandingsTable({ standings }: StandingsTableProps) {
  const showLegend = standings.length > PODIUM_SIZE;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Login</TableHead>
            <TableHead className="text-right">Pts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {standings.map((row) => {
            const zone = standingZone(row.position, standings.length);
            return (
              <TableRow
                key={row.userId}
                data-zone={zone ?? undefined}
                className={cn(
                  "border-l-2 border-l-transparent",
                  zone === "leader" && "border-l-primary bg-primary/8",
                  zone === "podium" && "border-l-success/70 bg-success/5",
                  // Divisória da faixa: a última linha do pódio fecha o bloco.
                  zone !== null &&
                    row.position === PODIUM_SIZE &&
                    "border-b-2 border-b-dashed border-b-border",
                  row.isCurrentUser && "ring-1 ring-primary/40",
                )}
              >
                <TableCell className="font-semibold tabular-nums">
                  {row.position}
                  {zone && (
                    <span className="sr-only">
                      {zone === "leader"
                        ? " — líder"
                        : " — zona de classificação"}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <TeamCrest
                      crest={row.crest}
                      size="sm"
                      title={`Brasão de ${row.teamName}`}
                    />
                    <span className={cn(row.isCurrentUser && "font-semibold")}>
                      {row.teamName}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.username ? `@${row.username}` : "—"}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums text-info">
                  {formatScore(row.points)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {showLegend && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Líder
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-1.5 rounded-full bg-success/70" />
            Zona de classificação
          </span>
        </div>
      )}
    </>
  );
}
