"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { CreateChampionshipDialog } from "@/components/championship/create-championship-dialog";
import type { ChampionshipCardData } from "@/lib/championship/types";
import { regionColor, regionLabel, type TeamRegion } from "@/lib/round/regions";
import { cn } from "@/lib/utils";

export type ChampionshipRailProps = {
  championships: ChampionshipCardData[];
  selectedId: string;
  /** Região da aba atual — pré-seleciona o formulário de criação (D4). */
  region: TeamRegion;
};

/**
 * Faixa horizontal rolável de campeonatos (plano 28, Fase 4, D4) — substitui
 * o `ChampionshipSelector`. Cada card já mostra a colocação do usuário
 * ("Você: Nº"), então não é preciso abrir o campeonato para saber onde se
 * está. "Criar campeonato" vira o último card, tracejado, em vez de um botão
 * solto ao lado da faixa.
 */
export function ChampionshipRail({
  championships,
  selectedId,
  region,
}: ChampionshipRailProps) {
  return (
    <ul
      className="mb-6 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 pb-1"
      aria-label="Seus campeonatos"
    >
      {championships.map((championship) => {
        const active = championship.id === selectedId;
        return (
          <li key={championship.id} className="contents">
          <Link
            href={`/ranking?c=${championship.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "clip-corner flex w-[200px] shrink-0 snap-start flex-col gap-2 bg-card p-3.5 ring-1 ring-border transition-colors [--clip:12px] hover:ring-foreground/25",
              active && "ring-2 ring-primary hover:ring-primary",
            )}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: regionColor(championship.region) }}
              />
              {regionLabel(championship.region)}
            </span>

            <span className="truncate text-sm font-extrabold uppercase">
              {championship.name}
            </span>

            <span className="mt-auto flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">
                {championship.memberCount}{" "}
                {championship.memberCount === 1 ? "membro" : "membros"}
              </span>
              {championship.myPosition !== null && (
                <span
                  className={cn(
                    "shrink-0 font-bold",
                    active ? "text-primary" : "text-foreground",
                  )}
                >
                  Você: {championship.myPosition}º
                </span>
              )}
            </span>
          </Link>
          </li>
        );
      })}

      <li className="contents">
        <CreateChampionshipDialog
          defaultRegion={region}
          trigger={
            <button
              type="button"
              className="clip-corner flex w-[200px] shrink-0 cursor-pointer snap-start flex-col items-center justify-center gap-1.5 border border-dashed border-border p-3.5 text-muted-foreground transition-colors [--clip:12px] hover:border-primary hover:text-primary"
            >
              <Plus aria-hidden className="size-5" />
              <span className="text-xs font-bold uppercase">
                Criar campeonato
              </span>
            </button>
          }
        />
      </li>
    </ul>
  );
}
