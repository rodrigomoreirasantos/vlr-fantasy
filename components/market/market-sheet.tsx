"use client";

import { useMemo, useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  evaluateSale,
  type SubstitutionContext,
} from "@/lib/market/eligibility";
import { formatCredits, formatCreditsDelta } from "@/lib/market/money";
import {
  sortMarketCandidates,
  type MarketSortOrder,
} from "@/lib/market/ordering";
import type { MarketScope } from "@/lib/market/scope";
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
  /**
   * `null` enquanto `loadMarket` ainda não voltou para esta vaga — a área da
   * lista mostra um skeleton nesse meio-tempo. O resto do Sheet (saldo, quem
   * sai, o fechamento e o botão de vender) não depende disso e renderiza na
   * hora, com o dado que a página já tinha.
   */
  market: Record<PlayerRole, Player[]> | null;
  balanceCents: number;
  marketOpen: boolean;
  /** Organizações cujo mercado fechou hoje (`lockedOrganizations`). */
  lockedTeams: readonly string[];
  closesIn: string;
  /** O instante de fechamento, recortado pela região do time — para o `<MarketCountdown>` do resumo. */
  closesAt: Date | null;
  rosteredPlayerIds: readonly string[];
  /** O escopo do time (região ou organizações classificadas) — quem entra tem de casar com ele. `null` junto com `market`. */
  scope: MarketScope | null;
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
 * nunca reescritos aqui; a ordem (preço ou alfabética, bloqueados sempre por
 * último) vem de `sortMarketCandidates` (lib/market/ordering.ts) — o
 * `<ToggleGroup>` troca só o critério, o estado vive aqui e não persiste
 * entre aberturas do Sheet.
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
  closesAt,
  rosteredPlayerIds,
  scope,
  onConfirm,
  onSell,
  pending = false,
}: MarketSheetProps) {
  const outgoing = selection?.outgoing ?? null;
  const [sortOrder, setSortOrder] = useState<MarketSortOrder>("price");

  // `scope` chega `null` enquanto `loadMarket` não voltou para esta vaga —
  // sem ele não há como montar o contexto (`SubstitutionContext.scope` não é
  // opcional), então `ctx` também fica `null` até lá. O bloco de venda não
  // depende disso: `evaluateSale` (abaixo) nunca olha `scope`.
  const ctx: SubstitutionContext | null = useMemo(() => {
    if (!selection || !scope) return null;
    return {
      marketOpen,
      lockedTeams,
      balanceCents,
      outgoing,
      rosteredPlayerIds,
      scope,
    };
  }, [
    selection,
    outgoing,
    marketOpen,
    lockedTeams,
    balanceCents,
    rosteredPlayerIds,
    scope,
  ]);

  const saleVerdict = useMemo(() => {
    if (!outgoing) return null;
    return evaluateSale({ marketOpen, lockedTeams, balanceCents }, outgoing);
  }, [outgoing, marketOpen, lockedTeams, balanceCents]);

  const candidatesByRole = useMemo(() => {
    if (!ctx || !market) return null;
    return Object.fromEntries(
      PLAYER_ROLES.map((role) => [
        role,
        sortMarketCandidates(market[role] ?? [], ctx, sortOrder),
      ]),
    ) as Record<PlayerRole, Player[]>;
  }, [ctx, market, sortOrder]);

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
        {selection && (
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
                closesAt={closesAt}
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

              {/* Só faz sentido depois que `loadMarket` volta — antes disso
                  não há lista para reordenar. */}
              {candidatesByRole && (
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Ordenar por
                  </span>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={sortOrder}
                    onValueChange={(value) => {
                      // Radix devolve "" ao clicar no item já pressionado —
                      // ignorado, para sempre haver um critério selecionado.
                      if (value) setSortOrder(value as MarketSortOrder);
                    }}
                    aria-label="Ordenar mercado"
                  >
                    <ToggleGroupItem
                      value="price"
                      aria-label="Ordenar por preço"
                      className="cursor-pointer text-xs"
                    >
                      Preço
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="alphabetical"
                      aria-label="Ordenar alfabeticamente"
                      className="cursor-pointer text-xs"
                    >
                      A-Z
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              )}

              {/*
                `key` força o Tabs a remontar (e reavaliar `defaultValue`)
                sempre que a vaga selecionada muda — trocar de vaga sem
                fechar o Sheet não deve manter a aba da vaga anterior.

                O `market !== null` no fim da chave não é detalhe: o Sheet
                agora **abre** sem catálogo, e `Tabs` é não-controlado — lê
                `defaultValue` só ao montar. Sem remontar quando o mercado
                chega, uma vaga vazia ficaria presa na primeira função
                (`PLAYER_ROLES[0]`, o fallback de `initialRole` sem
                candidatos) mesmo que ela não tenha ninguém e outra tenha:
                aba selecionada, desabilitada e anunciando "Nenhum Duelista
                disponível". Remontar aqui é seguro porque, enquanto carrega,
                todas as abas estão desabilitadas — não há escolha do usuário
                para perder.
              */}
              <Tabs
                key={`${selection.position}-${outgoing?.id ?? "empty"}-${market !== null}`}
                defaultValue={initialRole}
                className="flex min-h-0 flex-1 flex-col gap-3"
              >
                <TabsList className="w-full">
                  {PLAYER_ROLES.map((role) => (
                    <TabsTrigger
                      key={role}
                      value={role}
                      disabled={
                        !candidatesByRole || candidatesByRole[role].length === 0
                      }
                    >
                      {role}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {candidatesByRole && ctx ? (
                  PLAYER_ROLES.map((role) => {
                    const candidates = candidatesByRole[role];
                    return (
                      <TabsContent key={role} value={role} className="min-h-0">
                        {/*
                          min-h-0 é o que faz o flex-1 valer: sem ele, um flex
                          item sem overflow próprio assume min-height:auto e
                          cresce para caber todo o conteúdo (o `<ul>`
                          inteiro), em vez de ser limitado pelo espaço
                          disponível no Sheet — daí a lista cortar sem barra
                          de rolagem.
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
                  })
                ) : (
                  // `loadMarket` ainda não voltou para esta vaga — as abas
                  // acima já nascem desabilitadas (`!candidatesByRole`).
                  <div
                    aria-busy="true"
                    aria-live="polite"
                    className="flex flex-1 flex-col gap-2 px-1"
                  >
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      Carregando o mercado…
                    </p>
                    {Array.from({ length: 3 }, (_, index) => (
                      <div
                        key={index}
                        className="h-14 shrink-0 animate-pulse rounded-md bg-secondary"
                      />
                    ))}
                  </div>
                )}
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
