import { TeamCrest } from "@/components/crest/team-crest";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatScore } from "@/lib/team/score";
import { cn } from "@/lib/utils";
import type { RankedStanding } from "@/lib/championship/types";

export type StandingsTableProps = {
  standings: RankedStanding[];
};

/** Tabela de classificação de um campeonato — a linha do usuário se destaca. */
export function StandingsTable({ standings }: StandingsTableProps) {
  return (
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
        {standings.map((row) => (
          <TableRow
            key={row.userId}
            className={cn(row.isCurrentUser && "ring-1 ring-primary/40")}
          >
            <TableCell className="font-semibold tabular-nums">
              {row.position}
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
        ))}
      </TableBody>
    </Table>
  );
}
