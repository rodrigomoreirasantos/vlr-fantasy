"use client";

import { PlayerIdentity } from "@/components/team/player-row";
import { PlayerPrice } from "@/components/team/player-price";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  blockReasonLabel,
  blockReasonMessage,
  evaluateSubstitution,
  type SubstitutionContext,
} from "@/lib/market/eligibility";
import { formatCredits, formatCreditsDelta } from "@/lib/market/money";
import type { Player } from "@/lib/team/types";
import { cn } from "@/lib/utils";

export type MarketPlayerRowProps = {
  ctx: SubstitutionContext;
  candidate: Player;
  onConfirm: (candidate: Player) => void;
};

/**
 * Um card do mercado: identidade do candidato numa linha, preço/veredito e
 * o botão "Contratar" na linha de baixo. O veredito vem de
 * `evaluateSubstitution` — a mesma função que a Server Action usa dentro da
 * transação. Quem não pode ser contratado aparece mesmo assim, com o motivo
 * visível e o botão travado (nunca escondido).
 *
 * Empilhado em duas linhas (não um único `flex` horizontal) de propósito:
 * identidade, preço, veredito e botão juntos numa linha só não cabiam na
 * largura do Sheet sem cortar texto.
 */
export function MarketPlayerRow({ ctx, candidate, onConfirm }: MarketPlayerRowProps) {
  const verdict = evaluateSubstitution(ctx, candidate);
  const blocked = verdict.blockedBy !== null;
  const reasonId = `market-row-reason-${candidate.id}`;

  return (
    <li
      className={cn(
        "clip-corner flex flex-col gap-2.5 bg-secondary p-3 ring-1 ring-border [--clip:10px]",
        blocked && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2.5">
        <PlayerIdentity player={candidate} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
        <div className="min-w-0">
          <PlayerPrice priceCents={candidate.priceCents} className="text-base" />

          {blocked ? (
            <Badge variant="outline" className="mt-1 text-[10px]">
              {blockReasonLabel(verdict.blockedBy!)}
            </Badge>
          ) : (
            <p className="mt-1 truncate text-[10px] font-semibold text-muted-foreground tabular-nums">
              {formatCreditsDelta(verdict.netCostCents)} · saldo{" "}
              {formatCredits(verdict.balanceAfterCents)}
            </p>
          )}
        </div>

        <Button
          size="sm"
          className="flex-none"
          aria-disabled={blocked}
          aria-describedby={blocked ? reasonId : undefined}
          aria-label={`Contratar ${candidate.nickname} por ${formatCredits(candidate.priceCents)}`}
          onClick={() => {
            if (!blocked) onConfirm(candidate);
          }}
        >
          Contratar
        </Button>
      </div>

      {blocked && (
        <p id={reasonId} className="text-[10px] text-muted-foreground">
          {blockReasonMessage(verdict.blockedBy!, ctx.outgoing.role)}
        </p>
      )}
    </li>
  );
}
