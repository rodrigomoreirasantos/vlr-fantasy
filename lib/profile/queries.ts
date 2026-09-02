import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { account } from "@/db/schema";

/** Provider usado pelo better-auth para contas de e-mail/senha. */
const CREDENTIAL_PROVIDER = "credential";

/**
 * O usuário tem uma conta de e-mail/senha (além de, ou em vez de, OAuth)?
 * Usada por `AccountPanel` para decidir se mostra o formulário de troca de
 * senha — quem só entra pelo Google não tem senha para trocar.
 */
export async function hasPasswordAccount(userId: string): Promise<boolean> {
  const row = await db.query.account.findFirst({
    where: and(
      eq(account.userId, userId),
      eq(account.providerId, CREDENTIAL_PROVIDER),
      isNotNull(account.password),
    ),
  });
  return row !== undefined;
}
