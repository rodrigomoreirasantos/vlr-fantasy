"use client";

import { cn } from "@/lib/utils";

export type FilterChipProps = {
  label: string;
  /** O nome longo, quando `label` é a versão curta. Vira o `title` do botão. */
  title?: string;
  /** Quantos itens este filtro entrega. Omitido quando contar não diz nada. */
  count?: number;
  active: boolean;
  /** Um filtro que ainda não pode ser escolhido — com o motivo no `title`. */
  disabled?: boolean;
  /** Marca o chip com a cor da sua série/região (`regionColor`, `--chart-N`). */
  accent?: string;
  onSelect: () => void;
};

/**
 * Um chip de filtro. `aria-pressed` em vez de uma `<ul>` de links: o estado
 * "este filtro está ligado" é o que o leitor de tela precisa ouvir, e é o que
 * o botão comunica sem inventar navegação que não existe.
 *
 * Nasceu dentro de `<MatchSchedule>` e saiu de lá quando o terceiro filtro da
 * Home apareceu — hoje serve campeonato, região, jogador e métrica.
 */
export function FilterChip({
  label,
  title,
  count,
  active,
  disabled = false,
  accent,
  onSelect,
}: FilterChipProps) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "clip-corner flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.12em] uppercase ring-1 transition-colors [--clip:6px]",
        active
          ? "bg-primary text-primary-foreground ring-primary"
          : "bg-secondary text-muted-foreground ring-border hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
      )}
    >
      {accent && (
        // O ponto colorido amarra o chip à linha do gráfico (ou à etiqueta da
        // região no card) sem depender de o usuário distinguir cores no texto.
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ backgroundColor: accent }}
        />
      )}
      {label}
      {count !== undefined && (
        <span
          className={cn("tabular-nums", active ? "opacity-70" : "opacity-60")}
        >
          {count}
        </span>
      )}
    </button>
  );
}
