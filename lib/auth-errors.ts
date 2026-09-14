// `import type`: só o tipo é usado (`typeof authClient`). Um import de valor
// arrastaria `better-auth/react` para o bundle do servidor — este módulo também
// traduz erros dentro de Server Actions (app/(auth)/signup/actions.ts).
import type { authClient } from "@/lib/auth-client";

type ErrorCode = keyof typeof authClient.$ERROR_CODES;

// `RESET_PASSWORD_DISABLED` é emitido em runtime por `api/routes/password.mjs`
// mas não está no `$ERROR_CODES` do client (o tipo não é agregado dali) —
// união manual só para este código.
const errorMessages: Partial<
  Record<ErrorCode | "RESET_PASSWORD_DISABLED", string>
> = {
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail.",
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_EMAIL: "E-mail inválido.",
  USER_NOT_FOUND: "Não encontramos uma conta com este e-mail.",
  PASSWORD_TOO_SHORT: "A senha deve ter pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "A senha é muito longa.",
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    "Esta conta não possui login por e-mail e senha. Tente entrar com o Google ou a Twitch.",
  // Não acontece mais no login (a verificação não é obrigatória, lib/auth.ts);
  // fica traduzido porque outros endpoints de e-mail ainda podem emiti-lo.
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail para continuar.",
  SOCIAL_ACCOUNT_ALREADY_LINKED:
    "Esta conta já está vinculada a outro usuário.",
  FAILED_TO_CREATE_USER: "Não foi possível criar a conta. Tente novamente.",
  USERNAME_IS_ALREADY_TAKEN: "Este login já está em uso.",
  INVALID_USERNAME:
    "Login inválido. Use apenas letras, números, ponto e underline.",
  USERNAME_TOO_SHORT: "O login deve ter pelo menos 3 caracteres.",
  USERNAME_TOO_LONG: "O login deve ter no máximo 20 caracteres.",
  INVALID_PASSWORD: "Senha atual incorreta.",
  // `changePassword` roda sob `sensitiveSessionMiddleware` do better-auth:
  // uma sessão mais velha que `session.freshAge` é rejeitada com este código.
  SESSION_EXPIRED: "Por segurança, entre novamente antes de trocar a senha.",
  INVALID_TOKEN: "Este link é inválido ou já foi usado. Peça um novo.",
  TOKEN_EXPIRED: "Este link expirou. Peça um novo.",
  EMAIL_ALREADY_VERIFIED: "Este e-mail já está confirmado. É só entrar.",
  RESET_PASSWORD_DISABLED:
    "A recuperação de senha está indisponível. Tente mais tarde.",
};

const genericErrorMessage = "Algo deu errado. Tente novamente em instantes.";

export function translateAuthError(code?: string | null): string {
  if (code && code in errorMessages) {
    return errorMessages[code as ErrorCode] as string;
  }
  return genericErrorMessage;
}

/**
 * Erros de OAuth chegam como query string (`?error=...`) em minúsculas com
 * underscore — um formato diferente do `$ERROR_CODES` usado acima
 * (ver `oauth2/errors.mjs`). Precisa de tradutor próprio.
 */
const oauthErrorMessages: Record<string, string> = {
  account_not_linked:
    "Já existe uma conta com este e-mail aguardando confirmação. Confirme o e-mail e tente de novo.",
  email_not_found:
    "O provedor não devolveu um e-mail. Tente cadastrar com e-mail e senha.",
  email_not_verified:
    "O e-mail dessa conta ainda não foi confirmado no provedor.",
  unable_to_create_user: "Não foi possível criar a conta. Tente novamente.",
  state_not_found: "A sessão de login expirou. Tente novamente.",
  invalid_callback_request:
    "Não foi possível concluir o login. Tente novamente.",
};

export function translateOAuthError(code?: string | null): string {
  if (code && code in oauthErrorMessages) {
    return oauthErrorMessages[code];
  }
  return genericErrorMessage;
}
