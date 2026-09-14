"use client";

import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { sendVerificationEmail } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 60;

type ResendVerificationProps = {
  /**
   * E-mail já conhecido, quando quem chama já o tem. Quando ausente
   * (`/verify-email` com link expirado/inválido) o componente pede o e-mail
   * para digitar.
   */
  email?: string;
};

/**
 * Botão de reenvio do e-mail de verificação, com cooldown de 60s — casa com
 * o limite de 3 req/60s de `/send-verification-email` no servidor.
 *
 * O endpoint é à prova de enumeração de e-mail: a mesma mensagem de sucesso
 * aparece exista ou não a conta — a UI nunca pode diferenciar os dois casos.
 */
export function ResendVerification({ email }: ResendVerificationProps) {
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => {
      const remaining = dayjs(cooldownUntil).diff(dayjs(), "second");
      setSecondsLeft(Math.max(0, remaining));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const targetEmail = email ?? typedEmail.trim();

  const handleClick = async () => {
    if (!targetEmail) return;
    setIsSending(true);
    await sendVerificationEmail({
      email: targetEmail,
      callbackURL: "/verify-email",
    });
    setIsSending(false);
    setCooldownUntil(dayjs().add(COOLDOWN_SECONDS, "second").toDate());
    toast.success("Link reenviado. Confira seu e-mail.");
  };

  const disabled = isSending || secondsLeft > 0 || !targetEmail;

  let label = "Não recebeu? Reenviar";
  if (isSending) label = "Enviando…";
  else if (secondsLeft > 0) label = `Reenviar em ${secondsLeft}s`;

  return (
    <div className="space-y-3">
      {!email && (
        <Field>
          <FieldLabel htmlFor="resend-email">E-mail</FieldLabel>
          <Input
            id="resend-email"
            type="email"
            autoComplete="email"
            value={typedEmail}
            onChange={(event) => setTypedEmail(event.target.value)}
          />
        </Field>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled}
        aria-busy={isSending}
        onClick={handleClick}
      >
        {label}
      </Button>
    </div>
  );
}
