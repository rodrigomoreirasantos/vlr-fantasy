// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  passwordChangedEmail,
  resetPasswordEmail,
  verificationEmail,
} from "@/lib/email/templates";

const URL = "https://vlrfantasy.example/verify?token=abc123";

describe("verificationEmail", () => {
  it("tem assunto em pt-BR", () => {
    const email = verificationEmail({ name: "João", url: URL });
    expect(email.subject).toBe("Confirme seu e-mail");
  });

  it("inclui a URL no html e no text", () => {
    const email = verificationEmail({ name: "João", url: URL });
    expect(email.html).toContain(URL);
    expect(email.text).toContain(URL);
  });

  it("o text não contém tags HTML", () => {
    const email = verificationEmail({ name: "João", url: URL });
    expect(email.text).not.toMatch(/<[^>]+>/);
  });

  it("não interpola nome vazio como 'undefined'", () => {
    const email = verificationEmail({ name: "", url: URL });
    expect(email.html).not.toContain("undefined");
    expect(email.text).not.toContain("undefined");
  });
});

describe("resetPasswordEmail", () => {
  it("tem assunto em pt-BR", () => {
    const email = resetPasswordEmail({
      name: "João",
      url: URL,
      expiresInMinutes: 15,
    });
    expect(email.subject).toBe("Redefinir sua senha");
  });

  it("cita '15 minutos'", () => {
    const email = resetPasswordEmail({
      name: "João",
      url: URL,
      expiresInMinutes: 15,
    });
    expect(email.html).toContain("15 minutos");
    expect(email.text).toContain("15 minutos");
  });

  it("inclui a URL no html e no text", () => {
    const email = resetPasswordEmail({
      name: "João",
      url: URL,
      expiresInMinutes: 15,
    });
    expect(email.html).toContain(URL);
    expect(email.text).toContain(URL);
  });

  it("o text não contém tags HTML", () => {
    const email = resetPasswordEmail({
      name: "João",
      url: URL,
      expiresInMinutes: 15,
    });
    expect(email.text).not.toMatch(/<[^>]+>/);
  });

  it("não interpola nome vazio como 'undefined'", () => {
    const email = resetPasswordEmail({
      name: "",
      url: URL,
      expiresInMinutes: 15,
    });
    expect(email.html).not.toContain("undefined");
    expect(email.text).not.toContain("undefined");
  });
});

describe("passwordChangedEmail", () => {
  it("tem assunto em pt-BR e não contém tags HTML no text", () => {
    const email = passwordChangedEmail({ name: "João" });
    expect(email.subject).toBe("Sua senha foi alterada");
    expect(email.text).not.toMatch(/<[^>]+>/);
  });

  it("não interpola nome vazio como 'undefined'", () => {
    const email = passwordChangedEmail({ name: "" });
    expect(email.html).not.toContain("undefined");
    expect(email.text).not.toContain("undefined");
  });
});
