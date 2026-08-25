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
 * Uma linha do mercado: identidade do candidato, preço, e o veredito de
 * `evaluateSubstitution` — a mesma função que a Server Action usa dentro da
 * transação. Quem não pode ser contratado aparece mesmo assim, com o motivo
 * visível e o botão travado (nunca escondido).
 */
export function MarketPlayerRow({ ctx, candidate, onConfirm }: MarketPlayerRowProps) {
  const verdict = evaluateSubstitution(ctx, candidate);
  const blocked = verdict.blockedBy !== null;
  const reasonId = `market-row-reason-${candidate.id}`;

  return (
    <li
      className={cn(
        "clip-corner flex items-center gap-2.5 bg-secondary px-3 py-2.5 ring-1 ring-border [--clip:10px]",
        blocked && "opacity-60",
      )}
    >
      <PlayerIdentity player={candidate} />

      <div className="flex flex-none flex-col items-end gap-1">
        <PlayerPrice priceCents={candidate.priceCents} />

        {blocked ? (
          <Badge variant="outline" className="text-[10px]">
            {blockReasonLabel(verdict.blockedBy!)}
          </Badge>
        ) : (
          <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
            {formatCreditsDelta(verdict.netCostCents)} · saldo{" "}
            {formatCredits(verdict.balanceAfterCents)}
          </span>
        )}

        <Button
          size="sm"
          aria-disabled={blocked}
          aria-describedby={blocked ? reasonId : undefined}
          aria-label={`Contratar ${candidate.nickname} por ${formatCredits(candidate.priceCents)}`}
          onClick={() => {
            if (!blocked) onConfirm(candidate);
          }}
        >
          Contratar
        </Button>

        {blocked && (
          <p id={reasonId} className="max-w-40 text-right text-[10px] text-muted-foreground">
            {blockReasonMessage(verdict.blockedBy!, ctx.outgoing.role)}
          </p>
        )}
      </div>
    </li>
  );
}
