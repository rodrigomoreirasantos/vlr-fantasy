"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { inviteMember } from "@/app/(app)/ranking/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  inviteMemberSchema,
  type InviteMemberInput,
} from "@/lib/validations/championship";

export type InviteMemberFormProps = {
  championshipId: string;
};

/** Formulário de convite por login — visível só para o dono do campeonato. */
export function InviteMemberForm({ championshipId }: InviteMemberFormProps) {
  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { championshipId, username: "" },
  });

  const { execute, isExecuting } = useAction(inviteMember, {
    onSuccess: () => {
      toast.success("Convite enviado!");
      form.reset({ championshipId, username: "" });
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível enviar o convite.");
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => execute(values))}
      className="flex flex-wrap items-start gap-2"
    >
      <FieldGroup className="min-w-48 flex-1">
        <Controller
          name="username"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center gap-2 rounded-md border border-input bg-background/40 px-2.5 has-[input:focus-visible]:border-ring">
                <span aria-hidden className="text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  {...field}
                  id={field.name}
                  placeholder="login do amigo"
                  aria-label="Login do amigo"
                  aria-invalid={fieldState.invalid}
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <Button type="submit" disabled={isExecuting}>
        {isExecuting ? "Convidando…" : "Convidar"}
      </Button>
    </form>
  );
}
