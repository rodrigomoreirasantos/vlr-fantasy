"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/auth-client";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/validations/auth";

const COOLDOWN_SECONDS = 60;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

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

  // Não inspeciona `error`: e-mail existente e inexistente passam pela mesma
  // tela de sucesso — é a resposta genérica do servidor (proteção contra
  // enumeração de e-mail, `api/routes/password.mjs`), preservada aqui.
  const sendReset = async (email: string) => {
    setIsSending(true);
    await requestPasswordReset({ email, redirectTo: "/reset-password" });
    setIsSending(false);
    setSubmittedEmail(email);
    setSent(true);
    setCooldownUntil(dayjs().add(COOLDOWN_SECONDS, "second").toDate());
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Se existir uma conta com esse e-mail, enviamos o link de redefinição.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isSending || secondsLeft > 0}
          onClick={() => sendReset(submittedEmail)}
        >
          {isSending
            ? "Enviando…"
            : secondsLeft > 0
              ? `Enviar de novo em ${secondsLeft}s`
              : "Enviar de novo"}
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => sendReset(values.email))}
      className="space-y-4"
    >
      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>E-mail</FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="email"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <Button
        type="submit"
        className="w-full"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting
          ? "Enviando…"
          : "Enviar link de redefinição"}
      </Button>
    </form>
  );
}
