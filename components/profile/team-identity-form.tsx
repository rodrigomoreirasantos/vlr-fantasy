"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { updateTeamIdentity } from "@/app/(app)/profile/actions";
import {
  CREST_SYMBOL_CREDIT,
  CrestSymbolIcon,
} from "@/components/crest/crest-symbols";
import { SHAPE_PATHS, TeamCrest } from "@/components/crest/team-crest";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CREST_COLOR_LABELS,
  CREST_COLOR_VARS,
  CREST_COLORS,
  CREST_SHAPE_LABELS,
  CREST_SHAPES,
  CREST_SYMBOL_LABELS,
  CREST_SYMBOLS,
} from "@/lib/crest/catalog";
import type { Crest } from "@/lib/crest/types";
import { cn } from "@/lib/utils";
import {
  teamIdentitySchema,
  type TeamIdentityInput,
} from "@/lib/validations/profile";

export type TeamIdentityFormProps = {
  name: string;
  crest: Crest;
};

type Section = "shape" | "symbol" | "colors";
type ColorPart = "background" | "foreground" | "border";

const COLOR_PARTS: readonly { part: ColorPart; label: string; legend: string }[] =
  [
    { part: "background", label: "Fundo", legend: "Cor de fundo" },
    { part: "foreground", label: "Símbolo", legend: "Cor do símbolo" },
    { part: "border", label: "Borda", legend: "Cor da borda" },
  ];

/**
 * Uma grade de opções só com ícone: `role="radiogroup"` com um
 * `<input type="radio">` escondido dentro de cada `<label>`. O nome de cada
 * opção existe para leitor de tela (`sr-only`) e para o tooltip (`title`),
 * mas não aparece como texto — é o que tira o ruído visual do editor.
 */
function TileGrid<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  optionLabel,
  renderTile,
  className,
  selectedRing = "primary",
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  optionLabel: (option: T) => string;
  renderTile: (option: T, checked: boolean) => React.ReactNode;
  className?: string;
  /** Anel vermelho some sobre um swatch vermelho — as cores usam o claro. */
  selectedRing?: "primary" | "foreground";
}) {
  return (
    <div role="radiogroup" aria-label={legend} className={cn("grid gap-1.5", className)}>
      {options.map((option) => {
        const checked = option === value;
        const label = optionLabel(option);
        return (
          <label
            key={option}
            title={label}
            className={cn(
              "clip-corner relative flex aspect-square cursor-pointer items-center justify-center bg-secondary text-muted-foreground ring-1 ring-border transition-colors ring-inset [--clip:6px]",
              "hover:text-foreground hover:ring-foreground/30",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              checked &&
                (selectedRing === "primary"
                  ? "bg-primary/12 text-primary ring-2 ring-primary hover:text-primary hover:ring-primary"
                  : "ring-2 ring-foreground hover:ring-foreground"),
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              checked={checked}
              onChange={() => onChange(option)}
            />
            {renderTile(option, checked)}
            <span className="sr-only">{label}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Nome do time + editor do brasão, num formulário só com um botão só de
 * salvar — duas ações para a mesma seção ("Identidade do time") era ruído,
 * não duas decisões diferentes do usuário. O brasão fica em destaque no
 * topo, sempre com o que está sendo montado; abaixo, um grupo de opções por
 * vez (Formato, Símbolo ou Cores) em vez de listas empilhadas. As cores usam
 * uma paleta só: os chips Fundo/Símbolo/Borda escolhem em qual parte ela é
 * aplicada, e já mostram a cor atual de cada parte.
 */
export function TeamIdentityForm({ name, crest }: TeamIdentityFormProps) {
  const [section, setSection] = useState<Section>("shape");
  const [part, setPart] = useState<ColorPart>("background");

  const form = useForm<TeamIdentityInput>({
    resolver: zodResolver(teamIdentitySchema),
    defaultValues: { name, ...crest },
  });

  const { execute, isExecuting } = useAction(updateTeamIdentity, {
    onSuccess: ({ input }) => {
      toast.success("Identidade do time salva.");
      // O salvo vira o novo ponto de partida: "Desfazer" volta para ele, e
      // "Salvar" só reacende quando algo mudar de novo.
      form.reset(input);
    },
    onError: ({ error }) => {
      toast.error(
        error.serverError ?? "Não foi possível salvar a identidade do time.",
      );
    },
  });

  // `form.watch()` sem argumento devolve o formulário inteiro tipado como
  // `TeamIdentityInput` — é o que alimenta o brasão ao vivo antes de salvar.
  // O React Compiler não memoiza o valor (aviso no lint): comportamento
  // esperado do react-hook-form, sem efeito no runtime.
  const preview = form.watch();
  const { isDirty } = form.formState;
  const activePart = COLOR_PARTS.find((entry) => entry.part === part)!;

  function editColor(next: ColorPart) {
    setPart(next);
    setSection("colors");
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) => execute(values))}
      className="flex flex-col gap-4"
    >
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

      {/* Palco: o brasão em tamanho real de destaque + as três partes. */}
      <div className="clip-corner relative flex flex-col items-center gap-4 overflow-hidden bg-background px-4 pt-6 pb-4 ring-1 ring-border ring-inset [--clip:14px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
        <TeamCrest
          crest={preview}
          size="lg"
          title={`Brasão de ${preview.name || name}`}
          className="relative"
        />

        <div
          role="radiogroup"
          aria-label="Parte do brasão"
          className="relative grid w-full grid-cols-3 gap-1.5"
        >
          {COLOR_PARTS.map((entry) => {
            const checked = section === "colors" && entry.part === part;
            const color = preview[entry.part];
            return (
              <label
                key={entry.part}
                className={cn(
                  "clip-corner flex cursor-pointer items-center gap-2 bg-secondary px-2.5 py-2 ring-1 ring-border transition-colors ring-inset [--clip:6px]",
                  "hover:ring-foreground/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  checked && "ring-2 ring-primary hover:ring-primary",
                )}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="crest-part"
                  checked={checked}
                  onChange={() => editColor(entry.part)}
                />
                <span
                  aria-hidden
                  className="clip-corner size-4 shrink-0 ring-1 ring-foreground/20 ring-inset [--clip:3px]"
                  style={{ background: CREST_COLOR_VARS[color] }}
                />
                <span className="min-w-0 leading-tight">
                  <span className="block text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                    {entry.label}
                  </span>
                  <span className="block truncate text-xs font-semibold">
                    {CREST_COLOR_LABELS[color]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as Section)}
      >
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="shape">Formato</TabsTrigger>
          <TabsTrigger value="symbol">Símbolo</TabsTrigger>
          <TabsTrigger value="colors">Cores</TabsTrigger>
        </TabsList>

        <TabsContent value="shape" className="pt-2">
          <Controller
            name="shape"
            control={form.control}
            render={({ field }) => (
              <TileGrid
                legend="Formato"
                name={field.name}
                value={field.value}
                options={CREST_SHAPES}
                onChange={field.onChange}
                optionLabel={(shape) => CREST_SHAPE_LABELS[shape]}
                className="grid-cols-6"
                renderTile={(shape) => (
                  <svg aria-hidden viewBox="0 0 64 64" className="size-6">
                    <path d={SHAPE_PATHS[shape]} fill="currentColor" />
                  </svg>
                )}
              />
            )}
          />
        </TabsContent>

        <TabsContent value="symbol" className="flex flex-col gap-3 pt-2">
          <Controller
            name="symbol"
            control={form.control}
            render={({ field }) => (
              <TileGrid
                legend="Símbolo"
                name={field.name}
                value={field.value}
                options={CREST_SYMBOLS}
                onChange={field.onChange}
                optionLabel={(symbol) => CREST_SYMBOL_LABELS[symbol]}
                className="grid-cols-6 sm:grid-cols-7"
                renderTile={(symbol) => (
                  <CrestSymbolIcon symbol={symbol} className="size-7" />
                )}
              />
            )}
          />
          {/* Crédito exigido pela licença CC BY 3.0 dos símbolos. */}
          <p className="text-[11px] text-muted-foreground">
            Símbolos por {CREST_SYMBOL_CREDIT.authors.join(", ")} —{" "}
            <a
              href={CREST_SYMBOL_CREDIT.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {CREST_SYMBOL_CREDIT.source}
            </a>
            ,{" "}
            <a
              href={CREST_SYMBOL_CREDIT.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {CREST_SYMBOL_CREDIT.license}
            </a>
            .
          </p>
        </TabsContent>

        <TabsContent value="colors" className="flex flex-col gap-2.5 pt-2">
          <p className="text-xs text-muted-foreground">
            Escolha a cor{" "}
            {part === "background"
              ? "do fundo"
              : part === "foreground"
                ? "do símbolo"
                : "da borda"}
            . Para mudar a parte, use Fundo, Símbolo ou Borda, logo acima.
          </p>
          <Controller
            key={part}
            name={part}
            control={form.control}
            render={({ field }) => (
              <TileGrid
                legend={activePart.legend}
                name={field.name}
                value={field.value}
                options={CREST_COLORS}
                onChange={field.onChange}
                optionLabel={(color) => CREST_COLOR_LABELS[color]}
                className="grid-cols-8"
                selectedRing="foreground"
                renderTile={(color) => (
                  <span
                    aria-hidden
                    className="clip-corner absolute inset-[3px] [--clip:4px]"
                    style={{ background: CREST_COLOR_VARS[color] }}
                  />
                )}
              />
            )}
          />
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        {isDirty && (
          <Button
            type="button"
            variant="ghost"
            disabled={isExecuting}
            onClick={() => form.reset()}
          >
            Desfazer
          </Button>
        )}
        <Button type="submit" disabled={!isDirty || isExecuting}>
          {isExecuting ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
