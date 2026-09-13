import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de `/ranking` (plano 27, Fase 1 —
 * `.claude/plans/27-tour-passo-a-passo.md`): repete a moldura real
 * (`app/(app)/ranking/page.tsx`) — abas de região, a linha de seletor +
 * "Criar liga" e o painel de Classificação.
 *
 * ⚠️ Nenhum `data-tour` aqui — ver o mesmo aviso em `home/loading.tsx`.
 */
export default function RankingLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-9">
      {/* RegionTabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      {/* Seletor de campeonato + criar liga */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Classificação */}
      <div className="clip-corner bg-card p-[18px] ring-1 ring-border [--clip:16px]">
        <Skeleton className="mb-3.5 h-3 w-28" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </main>
  );
}
