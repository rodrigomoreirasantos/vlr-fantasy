"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { updateTeamName } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  updateTeamNameSchema,
  type UpdateTeamNameInput,
} from "@/lib/validations/profile";

export type TeamNameFormProps = {
  name: string;
};

/** Renomeia o time — o header reflete o nome novo via `router.refresh()`. */
export function TeamNameForm({ name }: TeamNameFormProps) {
  const router = useRouter();

  const form = useForm<UpdateTeamNameInput>({
    resolver: zodResolver(updateTeamNameSchema),
    defaultValues: { name },
  });

  const { execute, isExecuting } = useAction(updateTeamName, {
    onSuccess: () => {
      toast.success("Nome do time atualizado!");
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível salvar o nome.");
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => execute(values))}
      className="flex flex-wrap items-start gap-2"
    >
      <FieldGroup className="min-w-48 flex-1">
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Nome do time</FieldLabel>
              <Input
                {...field}
                id={field.name}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <Button type="submit" disabled={isExecuting}>
        {isExecuting ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
