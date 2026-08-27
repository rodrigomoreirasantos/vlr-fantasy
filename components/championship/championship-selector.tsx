"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChampionshipSummary } from "@/lib/championship/types";

export type ChampionshipSelectorProps = {
  championships: ChampionshipSummary[];
  selectedId: string;
};

/**
 * Troca de campeonato via `?c=<id>` — navega para a mesma tela de ranking
 * com outro campeonato selecionado. Com um único campeonato, o `Select`
 * não agrega nada: só o nome aparece.
 */
export function ChampionshipSelector({
  championships,
  selectedId,
}: ChampionshipSelectorProps) {
  const router = useRouter();

  if (championships.length <= 1) {
    return (
      <span className="text-base font-extrabold tracking-wide uppercase">
        {championships[0]?.name}
      </span>
    );
  }

  return (
    <Select
      value={selectedId}
      onValueChange={(id) => router.push(`/ranking?c=${id}`)}
    >
      <SelectTrigger aria-label="Campeonato" className="min-w-48">
        <SelectValue placeholder="Selecione um campeonato" />
      </SelectTrigger>
      <SelectContent>
        {championships.map((championship) => (
          <SelectItem key={championship.id} value={championship.id}>
            {championship.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
