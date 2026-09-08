import { cn } from "@/lib/utils";

/**
 * As classes visuais de um chip de filtro (ligado/desligado), sem o
 * elemento — reaproveitada por `<FilterChip>` (botão, Client Component) e
 * por `<RegionTabs>` (link, Server Component — `components/team/region-tabs.tsx`).
 *
 * Vive num arquivo à parte, sem `"use client"`: `filter-chip.tsx` tem a
 * diretiva porque `<FilterChip>` usa `onClick`, e isso marcaria até uma
 * função pura como `chipClasses` como "só de cliente" — inchamável de um
 * Server Component. Função pura de string não precisa do boundary.
 */
export function chipClasses(opts: { active: boolean; disabled?: boolean }) {
  return cn(
    "clip-corner flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.12em] uppercase ring-1 transition-colors [--clip:6px]",
    opts.active
      ? "bg-primary text-primary-foreground ring-primary"
      : "bg-secondary text-muted-foreground ring-border hover:text-foreground",
    opts.disabled &&
      "cursor-not-allowed opacity-40 hover:text-muted-foreground",
  );
}
