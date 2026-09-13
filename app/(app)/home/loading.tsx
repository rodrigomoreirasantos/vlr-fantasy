import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de `/home` (plano 27, Fase 1 —
 * `.claude/plans/27-tour-passo-a-passo.md`): a mesma moldura da página real
 * (`app/(app)/home/page.tsx`) — `max-w-7xl`, `gap-6`, três painéis na mesma
 * ordem (Próximos jogos → Desempenho → Destaques) — para a navegação ficar
 * imediata e o Next poder pré-carregar parte da rota (rota dinâmica sem
 * `loading.tsx` só troca depois que o servidor termina de renderizar).
 *
 * ⚠️ Nenhum `data-tour` aqui: o tour guiado (`components/tour/`) precisa
 * esperar o conteúdo de verdade, nunca ancorar num esqueleto.
 */
function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="clip-corner bg-card p-[18px] ring-1 ring-border [--clip:16px]">
      <Skeleton className="mb-3.5 h-3 w-32" />
      {children}
    </div>
  );
}

export default function HomeLoading() {
  return (
    <PageContainer className="flex flex-col gap-6">
      {/* Próximos jogos */}
      <PanelFrame>
        <Skeleton className="mb-3 h-3 w-48" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </PanelFrame>

      {/* Desempenho */}
      <PanelFrame>
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </PanelFrame>

      {/* Destaques da rodada */}
      <PanelFrame>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </PanelFrame>
    </PageContainer>
  );
}
