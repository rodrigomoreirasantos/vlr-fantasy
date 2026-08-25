import { headers } from "next/headers";
import { createSafeActionClient } from "next-safe-action";

import { auth } from "@/lib/auth";

/**
 * Erro cujo `message` é seguro para chegar ao usuário final — usar para todo
 * bloqueio de regra de negócio dentro de uma Server Action (ex.
 * `blockReasonMessage` de `lib/market/eligibility.ts`). Qualquer outro erro é
 * tratado como falha inesperada e nunca vaza detalhe interno para a tela,
 * no mesmo espírito de `lib/auth-errors.ts`.
 */
export class ActionError extends Error {}

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof ActionError) return error.message;
    console.error("Erro na Server Action:", error);
    return "Não foi possível concluir a operação. Tente novamente.";
  },
});

export const authActionClient = actionClient.use(async ({ next }) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new ActionError("Sua sessão expirou. Entre novamente.");
  }
  return next({ ctx: { userId: session.user.id } });
});
