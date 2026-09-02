"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";

import { db } from "@/db";
import { auth } from "@/lib/auth";
import { translateAuthError } from "@/lib/auth-errors";
import { isUniqueViolation } from "@/lib/db/errors";
import { ActionError, actionClient } from "@/lib/safe-action";
import { teamNameExists, updateTeamNameForUser } from "@/lib/team/queries";
import { normalizeTeamName } from "@/lib/team/team-name";
import { signUpSchema } from "@/lib/validations/auth";

const NAME_TAKEN_MESSAGE = "Já existe um time com esse nome. Escolha outro.";

/**
 * Cadastro completo: cria a conta **e** batiza o time com o nome escolhido.
 *
 * Roda no servidor (e não via `signUp.email` no cliente, como antes) porque o
 * nome do time não cabe no payload do better-auth: quem cria o time é o hook
 * `databaseHooks.user.create.after` (lib/auth.ts), que só enxerga os campos do
 * usuário. Fazer as duas coisas aqui deixa o formulário com uma única chamada e
 * uma única superfície de erro.
 *
 * O cookie de sessão é gravado pelo plugin `nextCookies()` do better-auth, que
 * intercepta o `Set-Cookie` de `auth.api.*` dentro de Server Actions — por isso
 * ele é o último da lista de plugins.
 */
export const signUpWithTeam = actionClient
  .inputSchema(signUpSchema)
  .action(async ({ parsedInput }) => {
    const teamName = normalizeTeamName(parsedInput.teamName);

    // Antes de criar a conta: recusar aqui é o que evita deixar o usuário
    // cadastrado com um nome de time que ele não escolheu.
    if (await teamNameExists(db, teamName)) {
      throw new ActionError(NAME_TAKEN_MESSAGE);
    }

    let userId: string;
    try {
      const { user } = await auth.api.signUpEmail({
        // `name` (exibição) nasce do nickname — o cadastro não pede um nome
        // separado, e o perfil permite trocar depois.
        body: {
          name: parsedInput.username,
          username: parsedInput.username,
          email: parsedInput.email,
          password: parsedInput.password,
        },
        headers: await headers(),
      });
      userId = user.id;
    } catch (error) {
      if (error instanceof APIError) {
        throw new ActionError(translateAuthError(error.body?.code));
      }
      throw error;
    }

    // Neste ponto a conta e o time já existem — o time com o nome derivado do
    // nickname (`ensureFantasyTeam`). Aplicar o nome escolhido é a última etapa.
    try {
      await db.transaction((tx) => updateTeamNameForUser(tx, userId, teamName));
    } catch (error) {
      // Janela mínima entre a checagem lá em cima e este `UPDATE`: outro
      // cadastro levou o nome. A conta já está criada e a sessão ativa, então
      // não dá para "desfazer" o cadastro — o time fica com o nome derivado e a
      // mensagem manda renomear no perfil.
      if (isUniqueViolation(error)) {
        throw new ActionError(
          "Sua conta foi criada, mas esse nome de time acabou de ser escolhido por outra pessoa. Entre e renomeie o time no seu perfil.",
        );
      }
      throw error;
    }

    return { success: true as const };
  });
