"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { translateAuthError } from "@/lib/auth-errors";
import {
  changePasswordSchema,
  displayNameSchema,
  type ChangePasswordInput,
  type DisplayNameInput,
} from "@/lib/validations/profile";

export type AccountPanelProps = {
  name: string;
  hasPassword: boolean;
};

/**
 * Nome de exibição e senha — nome de exibição e senha não são Server
 * Actions: passam por `authClient.updateUser`/`authClient.changePassword` no
 * cliente, no mesmo padrão de `components/auth/sign-up-form.tsx`.
 */
export function AccountPanel({ name, hasPassword }: AccountPanelProps) {
  const router = useRouter();
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const nameForm = useForm<DisplayNameInput>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { name },
  });

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onSubmitName(values: DisplayNameInput) {
    setNameError(null);
    const { error } = await authClient.updateUser({ name: values.name });
    if (error) {
      setNameError(translateAuthError(error.code));
      return;
    }
    router.refresh();
  }

  async function onSubmitPassword(values: ChangePasswordInput) {
    setPasswordError(null);
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      setPasswordError(translateAuthError(error.code));
      return;
    }
    passwordForm.reset({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        noValidate
        onSubmit={nameForm.handleSubmit(onSubmitName)}
        className="flex flex-col gap-3"
      >
        {nameError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {nameError}
          </div>
        )}
        <FieldGroup>
          <Controller
            name="name"
            control={nameForm.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Nome de exibição</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  autoComplete="name"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
        <Button
          type="submit"
          disabled={nameForm.formState.isSubmitting}
          className="self-start"
        >
          {nameForm.formState.isSubmitting ? "Salvando…" : "Salvar nome"}
        </Button>
      </form>

      {hasPassword ? (
        <form
          noValidate
          onSubmit={passwordForm.handleSubmit(onSubmitPassword)}
          className="flex flex-col gap-3 border-t border-border pt-6"
        >
          {passwordError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {passwordError}
            </div>
          )}
          <FieldGroup>
            <Controller
              name="currentPassword"
              control={passwordForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Senha atual</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="newPassword"
              control={passwordForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Nova senha</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="confirmPassword"
              control={passwordForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    Confirmar nova senha
                  </FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <Button
            type="submit"
            disabled={passwordForm.formState.isSubmitting}
            className="self-start"
          >
            {passwordForm.formState.isSubmitting ? "Salvando…" : "Trocar senha"}
          </Button>
        </form>
      ) : (
        <p className="border-t border-border pt-6 text-sm text-muted-foreground">
          Você entra com o Google — não há senha para alterar.
        </p>
      )}
    </div>
  );
}
