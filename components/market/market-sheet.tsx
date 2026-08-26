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
import {
  evaluateSubstitution,
  type SubstitutionContext,
} from "@/lib/market/eligibility";
import { PLAYER_ROLES, type Player, type PlayerRole } from "@/lib/team/types";
import { cn } from "@/lib/utils";

/**
 * Qual vaga o mercado está preenchendo. `outgoing` é `null` para uma vaga
 * vazia — não há função exigida nem crédito de venda, então o mercado lista
 * as quatro funções agrupadas em vez de uma lista única.
 */
export type MarketSelection = {
  position: number;
  outgoing: Player | null;
};

export type MarketSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vaga selecionada — `null` enquanto nada está selecionado. */
  selection: MarketSelection | null;
  market: Record<PlayerRole, Player[]>;
  balanceCents: number;
  marketOpen: boolean;
  closesIn: string;
  rosteredPlayerIds: readonly string[];
  onConfirm: (candidate: Player) => void;
  pending?: boolean;
};

type CandidateGroup = {
  role: PlayerRole;
  /** Só aparece quando há mais de uma função na lista (vaga vazia). */
  showHeader: boolean;
  candidates: Player[];
};

// Quem pode ser contratado aparece primeiro; quem está bloqueado (sem saldo,
// etc.) vai para o fim do grupo. `sort` é estável, então a ordem por
// pontuação de `getMarketByRole` é preservada dentro de cada função.
function sortByEligibility(
  candidates: Player[],
  ctx: SubstitutionContext,
): Player[] {
  return [...candidates].sort((a, b) => {
    const aBlocked = evaluateSubstitution(ctx, a).blockedBy !== null;
    const bBlocked = evaluateSubstitution(ctx, b).blockedBy !== null;
    return Number(aBlocked) - Number(bBlocked);
  });
}

/**
 * Painel do mercado, aberto ao selecionar uma vaga da escalação — ocupada
 * (substituição, só a mesma função) ou vazia (nova contratação, todas as
 * funções). A filtragem, o preço e o bloqueio de cada linha vêm de
 * `evaluateSubstitution` (lib/market/eligibility.ts), nunca reescritos aqui.
 */
export function MarketSheet({
  open,
  onOpenChange,
  selection,
  market,
  balanceCents,
  marketOpen,
  closesIn,
  rosteredPlayerIds,
  onConfirm,
  pending = false,
}: MarketSheetProps) {
  const outgoing = selection?.outgoing ?? null;

  const ctx: SubstitutionContext | null = useMemo(() => {
    if (!selection) return null;
    return { marketOpen, balanceCents, outgoing, rosteredPlayerIds };
  }, [selection, outgoing, marketOpen, balanceCents, rosteredPlayerIds]);

  const groups = useMemo(() => {
    if (!selection || !ctx) return [];
    if (outgoing) {
      return [
        {
          role: outgoing.role,
          showHeader: false,
          candidates: sortByEligibility(market[outgoing.role] ?? [], ctx),
        },
      ] satisfies CandidateGroup[];
    }
    return PLAYER_ROLES.map((role) => ({
      role,
      showHeader: true,
      candidates: sortByEligibility(market[role] ?? [], ctx),
    })).filter((group) => group.candidates.length > 0);
  }, [selection, ctx, outgoing, market]);

  const hasCandidates = groups.some((group) => group.candidates.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        {selection && ctx && (
          <>
            <SheetHeader>
              <SheetTitle>
                Mercado · {outgoing ? outgoing.role : "Nova contratação"}
              </SheetTitle>
              <SheetDescription>
                {outgoing
                  ? `Substituindo ${outgoing.nickname}. Só aparecem jogadores da mesma função.`
                  : `Escolha um jogador para a vaga ${selection.position}.`}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
              <MarketSummaryBar
                balanceCents={balanceCents}
                outgoing={outgoing}
                position={selection.position}
                marketOpen={marketOpen}
                closesIn={closesIn}
              />

              {!marketOpen && (
                <Alert variant="destructive">
                  <TriangleAlert aria-hidden />
                  <AlertTitle>Mercado fechado</AlertTitle>
                  <AlertDescription>
                    As substituições reabrem quando a próxima janela de mercado
                    começar.
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
                {!hasCandidates ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {outgoing
                      ? `Nenhum ${outgoing.role} disponível no mercado.`
                      : "Nenhum jogador disponível no mercado."}
                  </p>
                ) : (
                  <div
                    className={cn(
                      "flex flex-col gap-4",
                      pending && "pointer-events-none opacity-70",
                    )}
                  >
                    {groups.map((group) => (
                      <div key={group.role} className="flex flex-col gap-2">
                        {group.showHeader && (
                          <h3 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                            {group.role}
                          </h3>
                        )}
                        <ul className="flex flex-col gap-2">
                          {group.candidates.map((candidate) => (
                            <MarketPlayerRow
                              key={candidate.id}
                              ctx={ctx}
                              candidate={candidate}
                              onConfirm={onConfirm}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
