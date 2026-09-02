"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { updateTeamCrest } from "@/app/(app)/profile/actions";
import { TeamCrest } from "@/components/crest/team-crest";
import { Button } from "@/components/ui/button";
import {
  CREST_COLOR_LABELS,
  CREST_COLOR_VARS,
  CREST_COLORS,
  CREST_SHAPE_LABELS,
  CREST_SHAPES,
  CREST_SYMBOL_ICONS,
  CREST_SYMBOL_LABELS,
  CREST_SYMBOLS,
  type CrestColor,
  type CrestShape,
  type CrestSymbol,
} from "@/lib/crest/catalog";
import type { Crest } from "@/lib/crest/types";
import { cn } from "@/lib/utils";
import { crestSchema, type CrestInput } from "@/lib/validations/profile";

export type CrestEditorProps = {
  crest: Crest;
  teamName: string;
};

/** Um grupo de opções acessível: `role="radiogroup"` com `<input type="radio" className="sr-only">` por dentro de cada `<label>`. */
function OptionGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  renderOption,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  renderOption: (option: T) => React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {legend}
      </legend>
      <div
        role="radiogroup"
        aria-label={legend}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const checked = option === value;
          return (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs transition-colors",
                checked
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:border-ring",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                checked={checked}
                onChange={() => onChange(option)}
              />
              {renderOption(option)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const COLOR_LEGENDS: Record<"background" | "foreground" | "border", string> = {
  background: "Cor de fundo",
  foreground: "Cor do símbolo",
  border: "Cor da borda",
};

/**
 * Editor do brasão com preview ao vivo: `form.watch()` alimenta o
 * `<TeamCrest>` acima dos controles, antes de qualquer salvamento.
 */
export function CrestEditor({ crest, teamName }: CrestEditorProps) {
  const form = useForm<CrestInput>({
    resolver: zodResolver(crestSchema),
    defaultValues: crest,
  });

  const { execute, isExecuting } = useAction(updateTeamCrest, {
    onSuccess: () => toast.success("Brasão atualizado!"),
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível salvar o brasão.");
    },
  });

  // `form.watch()` sem argumento devolve o formulário inteiro tipado como
  // `CrestInput` (nunca parcial) — é o que alimenta o preview ao vivo do
  // brasão antes de salvar. O React Compiler não consegue memoizar o valor
  // retornado (aviso no lint) porque `watch` é uma função da lib, não um
  // hook — comportamento esperado do react-hook-form, sem efeito no runtime.
  const preview = form.watch();

  return (
    <form
      onSubmit={form.handleSubmit((values) => execute(values))}
      className="flex flex-col gap-5"
    >
      <div className="flex justify-center py-2">
        <TeamCrest crest={preview} size="lg" title={`Brasão de ${teamName}`} />
      </div>

      <Controller
        name="shape"
        control={form.control}
        render={({ field }) => (
          <OptionGroup<CrestShape>
            legend="Formato"
            name={field.name}
            value={field.value}
            options={CREST_SHAPES}
            onChange={field.onChange}
            renderOption={(shape) => CREST_SHAPE_LABELS[shape]}
          />
        )}
      />

      <Controller
        name="symbol"
        control={form.control}
        render={({ field }) => (
          <OptionGroup<CrestSymbol>
            legend="Símbolo"
            name={field.name}
            value={field.value}
            options={CREST_SYMBOLS}
            onChange={field.onChange}
            renderOption={(symbol) => {
              const Icon = CREST_SYMBOL_ICONS[symbol];
              return (
                <>
                  <Icon aria-hidden className="size-3.5" />
                  {CREST_SYMBOL_LABELS[symbol]}
                </>
              );
            }}
          />
        )}
      />

      {(["background", "foreground", "border"] as const).map((fieldName) => (
        <Controller
          key={fieldName}
          name={fieldName}
          control={form.control}
          render={({ field }) => (
            <OptionGroup<CrestColor>
              legend={COLOR_LEGENDS[fieldName]}
              name={field.name}
              value={field.value}
              options={CREST_COLORS}
              onChange={field.onChange}
              renderOption={(color) => (
                <>
                  <span
                    aria-hidden
                    className="size-3 rounded-full ring-1 ring-border"
                    style={{ background: CREST_COLOR_VARS[color] }}
                  />
                  {CREST_COLOR_LABELS[color]}
                </>
              )}
            />
          )}
        />
      ))}

      <Button type="submit" disabled={isExecuting} className="self-start">
        {isExecuting ? "Salvando…" : "Salvar brasão"}
      </Button>
    </form>
  );
}
