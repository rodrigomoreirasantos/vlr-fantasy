"use client";

import { useMemo, useState } from "react";
import { Search, TriangleAlert } from "lucide-react";

import { MarketPlayerRow } from "@/components/market/market-player-row";
import { MarketSummaryBar } from "@/components/market/market-summary-bar";
import { PlayerPhoto } from "@/components/player/player-photo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { isTeamLocked } from "@/lib/market/lock";
import { formatCredits, formatCreditsDelta } from "@/lib/market/money";
import {
  DEFAULT_MARKET_SORT,
  evaluateMarketCandidates,
  filterAndSortMarketCandidates,
  type MarketCandidate,
  type MarketSortOrder,
} from "@/lib/market/ordering";
import type { MarketScope } from "@/lib/market/scope";
import type { TeamRegion } from "@/lib/round/regions";
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
  /**
   * A região do TIME — vem sempre por prop, nunca de `scope`: no Internacional
   * o escopo é `{kind:"organizations"}` e não tem região nenhuma para extrair.
   */
  region: TeamRegion;
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
 * sempre como abas, nos dois modos. O preço e o bloqueio de cada linha vêm
 * de `evaluateSubstitution` (lib/market/eligibility.ts), nunca reescritos
 * aqui; quem está com o mercado da organização fechado hoje nem aparece —
 * os outros motivos de bloqueio continuam visíveis, no fim da lista. A busca
 * e a ordem (preço ↓/↑ ou alfabética) vêm de `lib/market/ordering.ts`.
 */
export function MarketSheet({
  region,
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
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] =
    useState<MarketSortOrder>(DEFAULT_MARKET_SORT);

  // O RosterPanel mantém o Sheet sempre montado, só alternando `open` — o
  // estado sobrevive a fechar/reabrir. Sem isso, uma busca esquecida numa
  // vaga apareceria vazia na próxima. Ajuste de estado durante o render (o
  // padrão do React para isto): a cada vaga diferente (ou fechamento, que
  // zera `selection`), busca e ordem voltam ao padrão.
  const slotKey = `${selection?.position ?? "none"}-${outgoing?.id ?? "empty"}`;
  const [lastSlotKey, setLastSlotKey] = useState(slotKey);
  if (slotKey !== lastSlotKey) {
    setLastSlotKey(slotKey);
    setQuery("");
    setSortOrder(DEFAULT_MARKET_SORT);
  }

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

  // Estágio 1: avalia cada candidato uma vez e esconde quem tem o mercado da
  // organização fechado — não depende da busca, então não roda a cada tecla.
  const visibleByRole = useMemo(() => {
    if (!ctx || !market) return null;
    return Object.fromEntries(
      PLAYER_ROLES.map((role) => [
        role,
        evaluateMarketCandidates(market[role] ?? [], ctx),
      ]),
    ) as Record<PlayerRole, MarketCandidate[]>;
  }, [ctx, market]);

  // Estágio 2: filtra pela busca e ordena — este sim roda a cada tecla.
  const listByRole = useMemo(() => {
    if (!visibleByRole) return null;
    return Object.fromEntries(
      PLAYER_ROLES.map((role) => [
        role,
        filterAndSortMarketCandidates(visibleByRole[role], {
          query,
          order: sortOrder,
        }),
      ]),
    ) as Record<PlayerRole, MarketCandidate[]>;
  }, [visibleByRole, query, sortOrder]);

  const searching = query.trim() !== "";
  const totalMatches = listByRole
    ? PLAYER_ROLES.reduce((sum, role) => sum + listByRole[role].length, 0)
    : 0;

  // Se quem SAI está com a organização travada, `market-closed` cobre os
  // dois lados da troca e nenhum candidato foi escondido (guard em
  // `evaluateMarketCandidates`) — a lista continua inteira e bloqueada. Aqui
  // é onde isso vira uma explicação, em vez de quatro abas de badges iguais.
  const outgoingLocked =
    outgoing !== null && isTeamLocked(lockedTeams, outgoing.team);

  // Aba inicial: a função de quem sai, numa substituição — mesmo que ela não
  // tenha candidatos, é a mais relevante para o usuário ver primeiro. Numa
  // vaga vazia, a primeira função que tiver algum candidato. Olha sempre
  // `visibleByRole` (nunca a lista filtrada): a aba inicial não pode
  // depender de um termo de busca.
  const initialRole = useMemo((): PlayerRole => {
    if (outgoing) return outgoing.role;
    return (
      PLAYER_ROLES.find((role) => (visibleByRole?.[role].length ?? 0) > 0) ??
      PLAYER_ROLES[0]
    );
  }, [outgoing, visibleByRole]);

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
                region={region}
                balanceCents={balanceCents}
                outgoing={outgoing}
                marketOpen={marketOpen}
                closesIn={closesIn}
                closesAt={closesAt}
              />

              {outgoing && saleVerdict && (
                <div className="clip-corner flex flex-col gap-2 bg-secondary p-3 ring-1 ring-border [--clip:10px]">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PlayerPhoto
                      photoUrl={outgoing.photoUrl}
                      nickname={outgoing.nickname}
                      size={28}
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                        Vender {outgoing.nickname}
                      </p>
                      <p className="mt-1 truncate text-lg font-extrabold text-primary tabular-nums">
                        Você recebe{" "}
                        {formatCreditsDelta(saleVerdict.proceedsCents)}
                      </p>
                    </div>
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

              {/* `market-closed` cobre os dois lados da troca: se quem sai
                  está travado, todo candidato também fica — a lista continua
                  inteira e bloqueada (guard em `evaluateMarketCandidates`),
                  e é aqui que isso vira explicação em vez de quatro abas de
                  badges iguais. Só mostrado com `marketOpen`: sem rodada
                  ativa o alerta acima já cobre o caso. */}
              {marketOpen && outgoingLocked && outgoing && (
                <Alert variant="destructive">
                  <TriangleAlert aria-hidden />
                  <AlertTitle>Organização travada hoje</AlertTitle>
                  <AlertDescription>
                    O mercado da organização de {outgoing.nickname} já fechou
                    hoje. Ele só pode ser trocado quando o mercado dela reabrir.
                  </AlertDescription>
                </Alert>
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
                        !visibleByRole || visibleByRole[role].length === 0
                      }
                    >
                      {role}
                      {searching && (
                        <span className="tabular-nums opacity-70">
                          {listByRole?.[role].length ?? 0}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Abaixo das abas: busca por nome (as quatro funções ao
                    mesmo tempo, contador em cada aba) e a ordem — só depois
                    que `loadMarket` volta, não há lista para filtrar/ordenar
                    antes disso. */}
                {visibleByRole && (
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Buscar jogador"
                        aria-label="Buscar jogador pelo nome"
                        className="h-8 pl-7 text-xs"
                      />
                    </div>
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
                        value="price-desc"
                        aria-label="Preço: do mais caro para o mais barato"
                        className="cursor-pointer text-xs"
                      >
                        <span aria-hidden>↓</span> Preço
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="price-asc"
                        aria-label="Preço: do mais barato para o mais caro"
                        className="cursor-pointer text-xs"
                      >
                        <span aria-hidden>↑</span> Preço
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="alphabetical"
                        aria-label="A-Z: ordem alfabética"
                        className="cursor-pointer text-xs"
                      >
                        A-Z
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                )}

                {/* Anúncio da busca para leitor de tela — fora de
                    `TabsContent` de propósito: o Radix desmonta painéis
                    inativos, e uma live region desmontada não anuncia. */}
                <p role="status" className="sr-only">
                  {searching
                    ? `${totalMatches} ${totalMatches === 1 ? "jogador encontrado" : "jogadores encontrados"} para "${query}".`
                    : ""}
                </p>

                {listByRole && visibleByRole && market && ctx ? (
                  PLAYER_ROLES.map((role) => {
                    const candidates = listByRole[role];
                    const hadAnyBeforeSearch = market[role].length > 0;
                    const hadAnyAfterHiding = visibleByRole[role].length > 0;

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
                            <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-muted-foreground">
                              {!hadAnyBeforeSearch ? (
                                <p>Nenhum {role} disponível no mercado.</p>
                              ) : !hadAnyAfterHiding ? (
                                <p>Nenhum {role} com mercado aberto agora.</p>
                              ) : (
                                <>
                                  <p>{`Nenhum ${role} corresponde a "${query}".`}</p>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setQuery("")}
                                  >
                                    Limpar busca
                                  </Button>
                                </>
                              )}
                            </div>
                          ) : (
                            <ul
                              className={cn(
                                "flex flex-col gap-2",
                                pending && "pointer-events-none opacity-70",
                              )}
                            >
                              {candidates.map(({ player }) => (
                                <MarketPlayerRow
                                  key={player.id}
                                  ctx={ctx}
                                  candidate={player}
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
                  // acima já nascem desabilitadas (`!visibleByRole`).
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
