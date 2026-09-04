"use client";

import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";

import { MarketPlayerRow } from "@/components/market/market-player-row";
import { MarketSummaryBar } from "@/components/market/market-summary-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  evaluateSale,
  type SubstitutionContext,
} from "@/lib/market/eligibility";
import { formatCredits, formatCreditsDelta } from "@/lib/market/money";
import { sortMarketCandidates } from "@/lib/market/ordering";
import { PLAYER_ROLES, type Player, type PlayerRole } from "@/lib/team/types";
import { cn } from "@/lib/utils";

/**
 * Qual vaga o mercado está preenchendo. `outgoing` é `null` para uma vaga
 * vazia — não há crédito de venda a abater do custo da contratação. Qualquer
 * função é aceita nos dois casos: o usuário pode escalar cinco Duelistas se
 * quiser, então o mercado sempre lista as quatro funções, por abas.
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
  /** Organizações cujo mercado fechou hoje (`lockedOrganizations`). */
  lockedTeams: readonly string[];
  closesIn: string;
  rosteredPlayerIds: readonly string[];
  onConfirm: (candidate: Player) => void;
  /** Ausente numa vaga vazia — não há ninguém para vender. */
  onSell?: (outgoing: Player) => void;
  pending?: boolean;
};

/**
 * Painel do mercado, aberto ao selecionar uma vaga da escalação — ocupada
 * (substituição) ou vazia (nova contratação). As quatro funções aparecem
 * sempre como abas, nos dois modos. A filtragem, o preço e o bloqueio de
 * cada linha vêm de `evaluateSubstitution` (lib/market/eligibility.ts),
 * nunca reescritos aqui; a ordem (mais barato → mais caro, bloqueados por
 * último) vem de `sortMarketCandidates` (lib/market/ordering.ts).
 */
export function MarketSheet({
  open,
  onOpenChange,
  selection,
  market,
  balanceCents,
  marketOpen,
  lockedTeams,
  closesIn,
  rosteredPlayerIds,
  onConfirm,
  onSell,
  pending = false,
}: MarketSheetProps) {
  const outgoing = selection?.outgoing ?? null;

  const ctx: SubstitutionContext | null = useMemo(() => {
    if (!selection) return null;
    return {
      marketOpen,
      lockedTeams,
      balanceCents,
      outgoing,
      rosteredPlayerIds,
    };
  }, [
    selection,
    outgoing,
    marketOpen,
    lockedTeams,
    balanceCents,
    rosteredPlayerIds,
  ]);

  const saleVerdict = useMemo(() => {
    if (!outgoing) return null;
    return evaluateSale({ marketOpen, lockedTeams, balanceCents }, outgoing);
  }, [outgoing, marketOpen, lockedTeams, balanceCents]);

  const candidatesByRole = useMemo(() => {
    if (!ctx) return null;
    return Object.fromEntries(
      PLAYER_ROLES.map((role) => [
        role,
        sortMarketCandidates(market[role] ?? [], ctx),
      ]),
    ) as Record<PlayerRole, Player[]>;
  }, [ctx, market]);

  // Aba inicial: a função de quem sai, numa substituição — mesmo que ela não
  // tenha candidatos, é a mais relevante para o usuário ver primeiro. Numa
  // vaga vazia, a primeira função que tiver algum candidato.
  const initialRole = useMemo((): PlayerRole => {
    if (outgoing) return outgoing.role;
    return (
      PLAYER_ROLES.find((role) => (candidatesByRole?.[role].length ?? 0) > 0) ??
      PLAYER_ROLES[0]
    );
  }, [outgoing, candidatesByRole]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        {selection && ctx && candidatesByRole && (
          <>
            <SheetHeader>
              <SheetTitle>
                Mercado ·{" "}
                {outgoing
                  ? `Substituir ${outgoing.nickname}`
                  : "Nova contratação"}
              </SheetTitle>
              <SheetDescription>
                {outgoing
                  ? `Substituindo ${outgoing.nickname}. Escolha qualquer função.`
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

              {outgoing && saleVerdict && (
                <div className="clip-corner flex flex-col gap-2 bg-secondary p-3 ring-1 ring-border [--clip:10px]">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                      Vender {outgoing.nickname}
                    </p>
                    <p className="mt-1 truncate text-lg font-extrabold text-primary tabular-nums">
                      Você recebe{" "}
                      {formatCreditsDelta(saleVerdict.proceedsCents)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full"
                    aria-disabled={saleVerdict.blockedBy !== null || pending}
                    aria-label={`Vender ${outgoing.nickname} por ${formatCredits(outgoing.priceCents)}`}
                    onClick={() => {
                      if (!saleVerdict.blockedBy && !pending)
                        onSell?.(outgoing);
                    }}
                  >
                    Vender jogador
                  </Button>
                </div>
              )}

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
                `key` força o Tabs a remontar (e reavaliar `defaultValue`)
                sempre que a vaga selecionada muda — trocar de vaga sem
                fechar o Sheet não deve manter a aba da vaga anterior.
              */}
              <Tabs
                key={`${selection.position}-${outgoing?.id ?? "empty"}`}
                defaultValue={initialRole}
                className="flex min-h-0 flex-1 flex-col gap-3"
              >
                <TabsList className="w-full">
                  {PLAYER_ROLES.map((role) => (
                    <TabsTrigger
                      key={role}
                      value={role}
                      disabled={candidatesByRole[role].length === 0}
                    >
                      {role}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {PLAYER_ROLES.map((role) => {
                  const candidates = candidatesByRole[role];
                  return (
                    <TabsContent key={role} value={role} className="min-h-0">
                      {/*
                        min-h-0 é o que faz o flex-1 valer: sem ele, um flex
                        item sem overflow próprio assume min-height:auto e
                        cresce para caber todo o conteúdo (o `<ul>` inteiro),
                        em vez de ser limitado pelo espaço disponível no
                        Sheet — daí a lista cortar sem barra de rolagem.
                      */}
                      <ScrollArea className="-mx-1 h-full px-1">
                        {candidates.length === 0 ? (
                          <p className="py-6 text-center text-xs text-muted-foreground">
                            Nenhum {role} disponível no mercado.
                          </p>
                        ) : (
                          <ul
                            className={cn(
                              "flex flex-col gap-2",
                              pending && "pointer-events-none opacity-70",
                            )}
                          >
                            {candidates.map((candidate) => (
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
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
