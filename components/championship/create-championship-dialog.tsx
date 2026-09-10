"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { createChampionship } from "@/app/(app)/ranking/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_TEAM_REGION,
  regionLabel,
  TEAM_REGIONS,
  type TeamRegion,
} from "@/lib/round/regions";
import {
  createChampionshipSchema,
  type CreateChampionshipInput,
} from "@/lib/validations/championship";

export type CreateChampionshipDialogProps = {
  /** Região pré-selecionada no formulário — a aba de região onde o botão está. */
  defaultRegion?: TeamRegion;
};

/** Botão "Criar campeonato" + formulário num Dialog — cria e já navega para ele. */
export function CreateChampionshipDialog({
  defaultRegion = DEFAULT_TEAM_REGION,
}: CreateChampionshipDialogProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const form = useForm<CreateChampionshipInput>({
    resolver: zodResolver(createChampionshipSchema),
    defaultValues: { name: "", region: defaultRegion },
  });

  const { execute, isExecuting } = useAction(createChampionship, {
    onSuccess: ({ data }) => {
      toast.success("Campeonato criado!");
      setOpen(false);
      form.reset();
      if (data?.championshipId) {
        router.push(`/ranking?c=${data.championshipId}`);
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível criar o campeonato.");
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus aria-hidden className="size-4" />
          Criar campeonato
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar campeonato</DialogTitle>
          <DialogDescription>
            Dê um nome ao seu campeonato. Você entra automaticamente como membro
            e pode convidar amigos em seguida.
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-championship-form"
          onSubmit={form.handleSubmit((values) => execute(values))}
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Nome</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    placeholder="Liga dos Cria"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="region"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Região</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id={field.name}
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder="Selecione uma região" />
                    </SelectTrigger>
                    <SelectContent>
                      {TEAM_REGIONS.map((region) => (
                        <SelectItem key={region} value={region}>
                          {regionLabel(region)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button
            type="submit"
            form="create-championship-form"
            disabled={isExecuting}
          >
            {isExecuting ? "Criando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
