import { cn } from "@/lib/utils";

export type PageContainerProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Moldura repetida em toda página logada (`home`, `my-team`, `ranking`,
 * `profile` e seus `loading.tsx`): mesma largura máxima, mesmo respiro
 * lateral/vertical — menor no celular — e espaço extra embaixo para o
 * conteúdo nunca ficar atrás da `BottomNav` (`< md`, plano 28, Fase 1).
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <main
      className={cn(
        "mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-9 md:pb-9",
        className,
      )}
    >
      {children}
    </main>
  );
}
