"use server";

import { authActionClient } from "@/lib/safe-action";
import { markTourCompleted } from "@/lib/tour/queries";

/**
 * Marca o tour guiado como visto pelo usuário logado.
 *
 * Sem input: o usuário vem da sessão (`ctx.userId`), nunca do cliente — não
 * há como marcar o tour de outra conta. Sem `revalidatePath`: quem fecha o
 * tour é o `TourProvider` (`components/tour/tour-provider.tsx`), que já
 * atualiza o próprio estado local; a próxima visita ao layout é que lê a
 * coluna de novo.
 */
export const completeTour = authActionClient.action(async ({ ctx }) => {
  await markTourCompleted(ctx.userId);
  return { success: true as const };
});
