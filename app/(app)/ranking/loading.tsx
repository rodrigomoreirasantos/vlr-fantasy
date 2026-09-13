import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de `/ranking` (plano 27, Fase 1; layout atualizado no plano 28,
 * Fase 4 — `.claude/plans/28-design-responsivo-ranking-brasao.md`): repete a
 * moldura real (`app/(app)/ranking/page.tsx`) — abas de região, a faixa de
 * campeonatos, o pódio e a lista de classificação.
 *
 * ⚠️ Nenhum `data-tour` aqui — ver o mesmo aviso em `home/loading.tsx`.
 */
export default function RankingLoading() {
  return (
    <PageContainer>
      {/* RegionTabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      {/* ChampionshipRail */}
      <div className="mb-6 flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-[200px] shrink-0" />
        ))}
      </div>

      {/* Classificação: pódio + lista */}
      <div className="clip-corner bg-card p-[18px] ring-1 ring-border [--clip:16px]">
        <Skeleton className="mb-3.5 h-3 w-28" />

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <Skeleton className="h-36 w-full sm:order-1" />
          <Skeleton className="h-44 w-full sm:order-2" />
          <Skeleton className="h-36 w-full sm:order-3" />
        </div>

        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
