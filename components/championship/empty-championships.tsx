import { Trophy } from "lucide-react";

import { CreateChampionshipDialog } from "@/components/championship/create-championship-dialog";
import { regionLabel, type TeamRegion } from "@/lib/round/regions";

export type EmptyChampionshipsProps = {
  /**
   * Região da aba atual — quando informada, o texto e o botão falam da aba
   * onde o usuário está, não do estado vazio genérico.
   */
  region?: TeamRegion;
};

/** Estado vazio do Ranking: sem nenhum campeonato (ou nenhum na aba de região atual). */
export function EmptyChampionships({ region }: EmptyChampionshipsProps) {
  return (
    <div className="clip-corner flex flex-col items-center gap-4 bg-card p-12 text-center ring-1 ring-border [--clip:16px]">
      <Trophy aria-hidden className="size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {region
          ? `Você ainda não tem campeonato em ${regionLabel(region)}.`
          : "Você ainda não está em nenhum campeonato."}
      </p>
      <CreateChampionshipDialog defaultRegion={region} />
    </div>
  );
}
