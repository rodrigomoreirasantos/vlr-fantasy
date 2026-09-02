"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { sendFriendRequest } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  sendFriendRequestSchema,
  type SendFriendRequestInput,
} from "@/lib/validations/profile";

/** Formulário de pedido de amizade por login — mesma marcação de `InviteMemberForm`. */
export function AddFriendForm() {
  const form = useForm<SendFriendRequestInput>({
    resolver: zodResolver(sendFriendRequestSchema),
    defaultValues: { username: "" },
  });

  const { execute, isExecuting } = useAction(sendFriendRequest, {
    onSuccess: () => {
      toast.success("Pedido de amizade enviado!");
      form.reset({ username: "" });
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível enviar o pedido.");
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
        {isExecuting ? "Enviando…" : "Adicionar"}
      </Button>
    </form>
  );
}
