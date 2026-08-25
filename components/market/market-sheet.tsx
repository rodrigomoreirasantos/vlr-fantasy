"use client";

import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";

import { MarketPlayerRow } from "@/components/market/market-player-row";
import { MarketSummaryBar } from "@/components/market/market-summary-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { evaluateSubstitution, type SubstitutionContext } from "@/lib/market/eligibility";
import type { Player, PlayerRole } from "@/lib/team/types";
import { cn } from "@/lib/utils";

export type MarketSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Jogador que deixa a vaga — `null` enquanto nada está selecionado. */
  outgoing: Player | null;
  market: Record<PlayerRole, Player[]>;
  balanceCents: number;
  marketOpen: boolean;
  closesIn: string;
  rosteredPlayerIds: readonly string[];
  onConfirm: (candidate: Player) => void;
  pending?: boolean;
};

/**
 * Painel do mercado, aberto ao selecionar um jogador da escalação. Só mostra
 * candidatos da mesma função de `outgoing` — a filtragem, o preço e o
 * bloqueio de cada linha vêm de `evaluateSubstitution`
 * (lib/market/eligibility.ts), nunca reescritos aqui.
 */
export function MarketSheet({
  open,
  onOpenChange,
  outgoing,
  market,
  balanceCents,
  marketOpen,
  closesIn,
  rosteredPlayerIds,
  onConfirm,
  pending = false,
}: MarketSheetProps) {
  const ctx: SubstitutionContext | null = useMemo(() => {
    if (!outgoing) return null;
    return { marketOpen, balanceCents, outgoing, rosteredPlayerIds };
  }, [outgoing, marketOpen, balanceCents, rosteredPlayerIds]);

  // Quem pode ser contratado aparece primeiro; quem está bloqueado (sem
  // saldo, etc.) vai para o fim da lista. `sort` é estável, então a ordem
  // por pontuação de `getMarketByRole` é preservada dentro de cada grupo.
  const sortedCandidates = useMemo(() => {
    if (!outgoing || !ctx) return [];
    const candidates = market[outgoing.role] ?? [];
    return [...candidates].sort((a, b) => {
      const aBlocked = evaluateSubstitution(ctx, a).blockedBy !== null;
      const bBlocked = evaluateSubstitution(ctx, b).blockedBy !== null;
      return Number(aBlocked) - Number(bBlocked);
    });
  }, [market, outgoing, ctx]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        {outgoing && ctx && (
          <>
            <SheetHeader>
              <SheetTitle>Mercado · {outgoing.role}</SheetTitle>
              <SheetDescription>
                Substituindo {outgoing.nickname}. Só aparecem jogadores da
                mesma função.
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
              <MarketSummaryBar
                balanceCents={balanceCents}
                outgoing={outgoing}
                marketOpen={marketOpen}
                closesIn={closesIn}
              />

              {!marketOpen && (
                <Alert variant="destructive">
                  <TriangleAlert aria-hidden />
                  <AlertTitle>Mercado fechado</AlertTitle>
                  <AlertDescription>
                    As substituições reabrem quando a próxima janela de
                    mercado começar.
                  </AlertDescription>
                </Alert>
              )}

              {/*
                min-h-0 é o que faz o flex-1 valer: sem ele, um flex item sem
                overflow próprio assume min-height:auto e cresce para caber
                todo o conteúdo (o `<ul>` inteiro), em vez de ser limitado
                pelo espaço disponível no Sheet — daí a lista cortar sem
                barra de rolagem.
              */}
              <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
                {sortedCandidates.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Nenhum {outgoing.role} disponível no mercado.
                  </p>
                ) : (
                  <ul
                    className={cn(
                      "flex flex-col gap-2",
                      pending && "pointer-events-none opacity-70",
                    )}
                  >
                    {sortedCandidates.map((candidate) => (
                      <MarketPlayerRow
                        key={candidate.id}
                        ctx={ctx}
                        candidate={candidate}
                        onConfirm={onConfirm}
                      />
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
