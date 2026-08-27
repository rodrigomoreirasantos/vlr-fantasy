# Vender jogador (sell) no mercado de transferências

## Contexto

Hoje o `MarketSheet` só sabe fazer uma coisa quando uma vaga ocupada é
selecionada: **substituir** — o usuário é obrigado a escolher um jogador de
entrada da mesma função. Não existe caminho para simplesmente **vender**
(esvaziar a vaga e receber o crédito), o que causa o bug relatado:

> "depois de contratado não consigo vender" e "quando 1 player consome todo
> meu dinheiro não consigo executar mais nenhuma ação"

Causa raiz: `evaluateSubstitution` (`lib/market/eligibility.ts:69`) bloqueia
com `insufficient-balance` sempre que `incoming.priceCents - outgoing.priceCents

> balanceCents`. Se o jogador escalado é o mais barato da própria função (ou
> o saldo é 0 e todo mundo da função custa mais que ele), **toda** troca fica
> bloqueada — e como vender não existe, o usuário fica travado com aquele
> jogador para sempre, sem meio de liberar saldo.

A venda já é parcialmente suportada pelo modelo de dados: `outPlayerId` em
`transfer` já é opcional (uma contratação em vaga vazia não tem quem saiu).
Falta o espelho — `inPlayerId` opcional, para uma venda pura não ter quem
entrou.

## Abordagem

Tratar "vender" como uma operação irmã de "substituir": mesmo padrão de
transação/lock, mesma vaga, mas sem `incomingPlayerId`. Reaproveitar ao
máximo o que já existe (`lockTeamForUpdate`, `lockSlotForUpdate`,
`getActiveRound`, `isMarketOpen`, `blockReasonMessage`), com uma função de
domínio nova e simétrica a `evaluateSubstitution`.

### 1. Schema — `db/schema/transfers.ts`

- Remover `.notNull()` de `inPlayerId` (fica `uuid(...).references(...)`,
  igual a `outPlayerId` hoje).
- Adicionar `check("transfer_has_player", sql`${inPlayerId} IS NOT NULL OR
  ${outPlayerId} IS NOT NULL`)` para nunca existir uma linha sem jogador
  nenhum — reforça a integridade do histórico auditável (comentário já
  existente no arquivo).
- Gerar migration com `pnpm db:generate` e aplicar com `pnpm db:migrate`.

### 2. Domínio — `lib/market/eligibility.ts`

Nova função `evaluateSale`, simétrica a `evaluateSubstitution` mas sem
checagem de saldo/função (vender nunca custa saldo, sempre libera crédito):

```ts
export type SaleVerdict = {
  proceedsCents: number;
  balanceAfterCents: number;
  blockedBy: "market-closed" | null;
};

/**
 * Vender `outgoing` sem contratar ninguém: a vaga fica vazia e o preço
 * cheio do jogador é creditado no saldo. Único bloqueio é o mercado
 * fechado — vender não tem função exigida nem checagem de saldo.
 */
export function evaluateSale(
  ctx: { marketOpen: boolean; balanceCents: number },
  outgoing: Player,
): SaleVerdict {
  const proceedsCents = outgoing.priceCents;
  return {
    proceedsCents,
    balanceAfterCents: ctx.balanceCents + proceedsCents,
    blockedBy: ctx.marketOpen ? null : "market-closed",
  };
}
```

Reaproveita `blockReasonMessage("market-closed", null)` já existente — sem
duplicar string.

### 3. Query — `lib/team/queries.ts`

Nova `applySale`, ao lado de `applySubstitution`:

```ts
export async function applySale(
  tx: Querier,
  args: {
    teamId: string;
    slotId: string;
    outgoingPlayerId: string;
    roundId: string;
    outPriceCents: number;
    balanceAfterCents: number;
  },
): Promise<void> {
  // Vaga esvazia e perde a braçadeira — não existe capitão numa vaga vazia.
  await tx
    .update(rosterSlot)
    .set({ playerId: null, captain: false })
    .where(eq(rosterSlot.id, args.slotId));

  await tx
    .update(fantasyTeam)
    .set({ balanceCents: args.balanceAfterCents })
    .where(eq(fantasyTeam.id, args.teamId));

  await tx.insert(transfer).values({
    fantasyTeamId: args.teamId,
    roundId: args.roundId,
    rosterSlotId: args.slotId,
    outPlayerId: args.outgoingPlayerId,
    inPlayerId: null,
    outPriceCents: args.outPriceCents,
    inPriceCents: 0,
    balanceAfterCents: args.balanceAfterCents,
  });
}
```

O `captain: false` fecha um caso de borda real: sem isso, vender o capitão
deixaria uma vaga vazia marcada como capitã, e o índice único
`roster_slot_single_captain_uidx` travaria qualquer novo capitão até alguém
preencher a vaga de novo.

### 4. Validação — `lib/validations/market.ts`

```ts
export const sellPlayerSchema = z.object({
  slotId: z.uuid("Vaga inválida."),
  outgoingPlayerId: z.uuid("Jogador de saída inválido."),
});
export type SellPlayerInput = z.infer<typeof sellPlayerSchema>;
```

### 5. Server Action — `app/(app)/my-team/actions.ts`

Nova `sellPlayer`, mesmo esqueleto de `substitutePlayer` (lock time → lock
vaga → relê o jogador do catálogo → `evaluateSale` decide → `applySale`),
mas sem `incomingPlayerId`/checagem de já-escalado/função:

```ts
export const sellPlayer = authActionClient
  .inputSchema(sellPlayerSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { slotId, outgoingPlayerId } = parsedInput;

    await db.transaction(async (tx) => {
      const team = await lockTeamForUpdate(tx, ctx.userId);
      if (!team) {
        throw new ActionError("Não encontramos seu time. Recarregue a página.");
      }

      const activeRound = await getActiveRound(tx);
      const marketOpen = activeRound
        ? isMarketOpen({
            opensAt: activeRound.marketOpensAt,
            closesAt: activeRound.marketClosesAt,
          })
        : false;

      const slot = await lockSlotForUpdate(tx, team.id, slotId);
      if (!slot || slot.playerId !== outgoingPlayerId) {
        throw new ActionError(
          "Essa vaga mudou enquanto você decidia. Recarregue a página.",
        );
      }

      const [outgoing] = await loadPlayersByIds(tx, [outgoingPlayerId]);
      if (!outgoing) {
        throw new ActionError("Jogador não encontrado no catálogo.");
      }

      const verdict = evaluateSale(
        { marketOpen, balanceCents: team.balanceCents },
        toDomainPlayer(outgoing),
      );
      if (verdict.blockedBy) {
        throw new ActionError(blockReasonMessage(verdict.blockedBy, null));
      }
      if (!activeRound) {
        throw new ActionError("Não há rodada ativa no momento.");
      }

      await applySale(tx, {
        teamId: team.id,
        slotId,
        outgoingPlayerId,
        roundId: activeRound.id,
        outPriceCents: outgoing.priceCents,
        balanceAfterCents: verdict.balanceAfterCents,
      });
    });

    revalidatePath("/my-team");
    return { success: true as const };
  });
```

### 6. UI — `components/market/market-sheet.tsx`

Nova prop opcional `onSell?: (outgoing: Player) => void`. Quando `outgoing`
existe, renderiza um card de venda logo abaixo do `MarketSummaryBar` (mesmo
padrão visual de preço+veredito+botão do `MarketPlayerRow`, reaproveitando
`formatCredits`/`formatCreditsDelta` de `lib/market/money.ts`):

```tsx
{
  outgoing && (
    <div className="clip-corner flex items-center justify-between gap-3 bg-secondary p-3 ring-1 ring-border [--clip:10px]">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Vender sem substituir
        </p>
        <p className="mt-1 text-sm font-bold tabular-nums text-primary">
          {formatCreditsDelta(saleVerdict.proceedsCents)} · saldo{" "}
          {formatCredits(saleVerdict.balanceAfterCents)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="flex-none"
        aria-disabled={saleVerdict.blockedBy !== null}
        aria-label={`Vender ${outgoing.nickname} por ${formatCredits(outgoing.priceCents)}`}
        onClick={() => {
          if (!saleVerdict.blockedBy) onSell?.(outgoing);
        }}
      >
        Vender
      </Button>
    </div>
  );
}
```

`saleVerdict` vem de `evaluateSale({ marketOpen, balanceCents }, outgoing)`,
memoizado como o `ctx` de substituição já é. Prop opcional para não quebrar
quem monta `MarketSheet` sem venda (nenhum outro consumidor hoje, mas mantém
o componente utilizável isoladamente em teste sem forçar o callback).

### 7. Wiring — `components/team/roster-panel.tsx`

- Importar `sellPlayer` de `actions.ts`.
- Novo `useAction(sellPlayer, { onSuccess: toast + fecha sheet, onError:
toast })`, espelhando o de `substitutePlayer`.
- `handleSell(outgoing: Player)` chama
  `executeSell({ slotId: selectedSlot.id, outgoingPlayerId: outgoing.id })`.
- Passar `onSell={handleSell}` e combinar `pending={isExecuting ||
isSellingExecuting}` no `MarketSheet`.

## Arquivos tocados

- `db/schema/transfers.ts` (+ nova migration em `drizzle/`)
- `lib/market/eligibility.ts`
- `lib/team/queries.ts`
- `lib/validations/market.ts`
- `app/(app)/my-team/actions.ts`
- `components/market/market-sheet.tsx`
- `components/team/roster-panel.tsx`
- Testes: `lib/market/eligibility.test.ts`,
  `app/(app)/my-team/actions.test.ts`, `components/market/market-sheet.test.tsx`,
  `components/team/roster-panel.test.tsx` (novos casos cobrindo `evaluateSale`,
  `sellPlayer` e o botão "Vender")

## Verificação

1. `pnpm db:generate` + `pnpm db:migrate` — confirmar migration aplicada sem
   erro no Postgres local.
2. `pnpm exec vitest run` (ou os arquivos tocados) — todos os testes,
   incluindo os novos, verdes.
3. `pnpm lint` — sem `any`, sem regressão de tipos.
4. Fluxo manual: abrir `/my-team` (mercado já reaberto na sessão anterior),
   clicar num jogador escalado, clicar "Vender", confirmar que a vaga fica
   vazia, o saldo sobe pelo preço do jogador e (se era o capitão) a
   braçadeira some até alguém ser marcado de novo.
5. Cenário do bug relatado: zerar o saldo comprando um jogador caro, tentar
   trocá-lo (deve seguir bloqueado por saldo, comportamento correto), depois
   vendê-lo (deve liberar o saldo) e confirmar que dá para contratar outro
   em seguida — o travamento é resolvido.

Salvar este plano também em `.claude/plans/04-venda-jogadores.md` no
repositório após aprovação, por convenção do projeto.
