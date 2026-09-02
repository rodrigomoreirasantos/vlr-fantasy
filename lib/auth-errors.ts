// `import type`: só o tipo é usado (`typeof authClient`). Um import de valor
// arrastaria `better-auth/react` para o bundle do servidor — este módulo também
// traduz erros dentro de Server Actions (app/(auth)/signup/actions.ts).
import type { authClient } from "@/lib/auth-client";

type ErrorCode = keyof typeof authClient.$ERROR_CODES;

const errorMessages: Partial<Record<ErrorCode, string>> = {
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail.",
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_EMAIL: "E-mail inválido.",
  USER_NOT_FOUND: "Não encontramos uma conta com este e-mail.",
  PASSWORD_TOO_SHORT: "A senha deve ter pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "A senha é muito longa.",
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    "Esta conta não possui login por e-mail e senha. Tente entrar com o Google.",
  EMAIL_NOT_VERIFIED: "É necessário verificar o e-mail antes de entrar.",
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
};

const genericErrorMessage = "Algo deu errado. Tente novamente em instantes.";

export function translateAuthError(code?: string | null): string {
  if (code && code in errorMessages) {
    return errorMessages[code as ErrorCode] as string;
  }
  return genericErrorMessage;
}
