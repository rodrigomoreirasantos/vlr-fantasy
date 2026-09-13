import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de `/profile` (plano 27, Fase 1 —
 * `.claude/plans/27-tour-passo-a-passo.md`): repete a moldura real
 * (`app/(app)/profile/page.tsx`) — o mesmo grid de duas colunas, com
 * "Identidade do time" à esquerda e Amigos/Campeonatos/Conta à direita.
 *
 * ⚠️ Nenhum `data-tour` aqui — ver o mesmo aviso em `home/loading.tsx`.
 */
function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="clip-corner bg-card p-[18px] ring-1 ring-border [--clip:16px]">
      <Skeleton className="mb-3.5 h-3 w-28" />
      {children}
    </div>
  );
}

export default function ProfileLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-9">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <PanelFrame>
            <div className="flex flex-col gap-6">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          </PanelFrame>
        </div>

        <div className="flex flex-col gap-6">
          <PanelFrame>
            <Skeleton className="h-16 w-full" />
          </PanelFrame>
          <PanelFrame>
            <Skeleton className="h-24 w-full" />
          </PanelFrame>
          <PanelFrame>
            <Skeleton className="h-16 w-full" />
          </PanelFrame>
        </div>
      </div>
    </main>
  );
}
