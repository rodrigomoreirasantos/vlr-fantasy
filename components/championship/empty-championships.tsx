import { Trophy } from "lucide-react";

import { CreateChampionshipDialog } from "@/components/championship/create-championship-dialog";

/** Estado vazio de `/ranking`: usuário sem nenhum campeonato aceito. */
export function EmptyChampionships() {
  return (
    <div className="clip-corner flex flex-col items-center gap-4 bg-card p-12 text-center ring-1 ring-border [--clip:16px]">
      <Trophy aria-hidden className="size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Você ainda não está em nenhum campeonato.
      </p>
      <CreateChampionshipDialog />
    </div>
  );
}
