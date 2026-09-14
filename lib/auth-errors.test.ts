// @vitest-environment node
import { describe, expect, it } from "vitest";

import { translateAuthError, translateOAuthError } from "@/lib/auth-errors";

describe("translateAuthError", () => {
  it.each([
    ["INVALID_TOKEN", "Este link é inválido ou já foi usado. Peça um novo."],
    ["TOKEN_EXPIRED", "Este link expirou. Peça um novo."],
    ["EMAIL_ALREADY_VERIFIED", "Este e-mail já está confirmado. É só entrar."],
    [
      "RESET_PASSWORD_DISABLED",
      "A recuperação de senha está indisponível. Tente mais tarde.",
    ],
    [
      "EMAIL_NOT_VERIFIED",
      "Confirme seu e-mail para continuar.",
    ],
  ])("traduz %s para a frase pt-BR esperada", (code, expected) => {
    expect(translateAuthError(code)).toBe(expected);
  });

  it("devolve a mensagem genérica para um código desconhecido", () => {
    expect(translateAuthError("SOME_UNKNOWN_CODE")).toBe(
      "Algo deu errado. Tente novamente em instantes.",
    );
  });

  it("devolve a mensagem genérica quando o código é nulo ou ausente", () => {
    expect(translateAuthError(null)).toBe(
      "Algo deu errado. Tente novamente em instantes.",
    );
    expect(translateAuthError(undefined)).toBe(
      "Algo deu errado. Tente novamente em instantes.",
    );
  });
});

describe("translateOAuthError", () => {
  it.each([
    [
      "account_not_linked",
      "Já existe uma conta com este e-mail aguardando confirmação. Confirme o e-mail e tente de novo.",
    ],
    [
      "email_not_found",
      "O provedor não devolveu um e-mail. Tente cadastrar com e-mail e senha.",
    ],
    [
      "email_not_verified",
      "O e-mail dessa conta ainda não foi confirmado no provedor.",
    ],
    [
      "unable_to_create_user",
      "Não foi possível criar a conta. Tente novamente.",
    ],
    ["state_not_found", "A sessão de login expirou. Tente novamente."],
    [
      "invalid_callback_request",
      "Não foi possível concluir o login. Tente novamente.",
    ],
  ])("traduz %s para a frase pt-BR esperada", (code, expected) => {
    expect(translateOAuthError(code)).toBe(expected);
  });

  it("devolve a mensagem genérica para um código desconhecido", () => {
    expect(translateOAuthError("something_else")).toBe(
      "Algo deu errado. Tente novamente em instantes.",
    );
  });

  it("devolve a mensagem genérica quando o código é nulo ou ausente", () => {
    expect(translateOAuthError(null)).toBe(
      "Algo deu errado. Tente novamente em instantes.",
    );
    expect(translateOAuthError(undefined)).toBe(
      "Algo deu errado. Tente novamente em instantes.",
    );
  });
});
