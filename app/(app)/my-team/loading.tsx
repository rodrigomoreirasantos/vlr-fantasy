import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de `/my-team` (plano 27, Fase 1 —
 * `.claude/plans/27-tour-passo-a-passo.md`): repete a moldura real
 * (`app/(app)/my-team/page.tsx`) — abas de região, `BudgetBar`, o grid
 * Resumo/Time Montado, `TeamStats` e os dois cartões de maior/menor
 * pontuador, na mesma ordem.
 *
 * ⚠️ Nenhum `data-tour` aqui — ver o mesmo aviso em `home/loading.tsx`.
 */
function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="clip-corner bg-card p-[18px] ring-1 ring-border [--clip:16px]">
      <Skeleton className="mb-3.5 h-3 w-24" />
      {children}
    </div>
  );
}

export default function MyTeamLoading() {
  return (
    <PageContainer>
      {/* RegionTabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      {/* BudgetBar */}
      <div className="clip-corner mb-6 bg-secondary p-4 ring-1 ring-border [--clip:10px]">
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col items-center gap-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-5 w-14" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-3 h-1 w-full rounded-full" />
      </div>

      {/* RosterPanel: Resumo + Time Montado */}
      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-stretch">
        <PanelFrame>
          <ul className="flex flex-col gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </ul>
        </PanelFrame>
        <PanelFrame>
          <Skeleton className="h-[300px] w-full lg:h-full lg:min-h-[320px]" />
        </PanelFrame>
      </div>

      {/* TeamStats */}
      <div className="clip-corner bg-card p-[18px] ring-1 ring-border [--clip:16px]">
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col items-center gap-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-5 w-14" />
            </div>
          ))}
        </div>
      </div>

      {/* Maior/Menor pontuador */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </PageContainer>
  );
}
