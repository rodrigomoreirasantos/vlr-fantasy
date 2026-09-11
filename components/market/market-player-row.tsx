"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import {
  PlayerIdentity,
  PlayerPortraitBadge,
} from "@/components/team/player-row";
import { PlayerPrice } from "@/components/team/player-price";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  blockReasonLabel,
  blockReasonMessage,
  evaluateSubstitution,
  type SubstitutionContext,
} from "@/lib/market/eligibility";
import { formatCredits } from "@/lib/market/money";
import { targetPriceCents } from "@/lib/scoring/pricing";
import type { Player } from "@/lib/team/types";
import { cn } from "@/lib/utils";

type PriceTrend = "up" | "down" | "stable";

/**
 * Compara o alvo pela forma (`targetPriceCents`, Decisão 1, plano 20) contra
 * o preço atual — a mesma conta que decide o preço na próxima rodada
 * (`nextPriceCents`), só que sem o passo. É o que transforma "comprar quem
 * está em baixa" numa decisão informada em vez de um palpite.
 */
function priceTrend(candidate: Player): PriceTrend {
  const target = targetPriceCents(candidate.formPoints);
  if (target > candidate.priceCents) return "up";
  if (target < candidate.priceCents) return "down";
  return "stable";
}

const TREND_ICON: Record<PriceTrend, typeof TrendingUp> = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
};

const TREND_LABEL: Record<PriceTrend, string> = {
  up: "Valorizando",
  down: "Desvalorizando",
  stable: "Estável",
};

const TREND_CLASS: Record<PriceTrend, string> = {
  up: "text-success",
  down: "text-destructive",
  stable: "text-muted-foreground",
};

function PriceTrendBadge({ candidate }: { candidate: Player }) {
  const trend = priceTrend(candidate);
  const Icon = TREND_ICON[trend];

  return (
    <span
      aria-label={TREND_LABEL[trend]}
      title={TREND_LABEL[trend]}
      className={cn("inline-flex", TREND_CLASS[trend])}
    >
      <Icon aria-hidden className="size-3.5" />
    </span>
  );
}

export type MarketPlayerRowProps = {
  ctx: SubstitutionContext;
  candidate: Player;
  onConfirm: (candidate: Player) => void;
};

/**
 * Um card do mercado: identidade do candidato com o preço no lugar da
 * pontuação numa linha, motivo de bloqueio (se houver) e o botão
 * "Contratar" na linha de baixo. O veredito vem de `evaluateSubstitution` —
 * a mesma função que a Server Action usa dentro da transação. Quem não pode
 * ser contratado aparece mesmo assim, com o motivo visível e o botão travado
 * (nunca escondido).
 *
 * Mostra só o preço cheio do candidato — não o custo líquido nem o saldo
 * projetado após a troca. Numa substituição, o crédito de quem sai (que
 * abate esse preço) aparece uma única vez, no `MarketSummaryBar` do topo do
 * Sheet, em vez de repetido em cada card.
 */
export function MarketPlayerRow({
  ctx,
  candidate,
  onConfirm,
}: MarketPlayerRowProps) {
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
        <PlayerPortraitBadge player={candidate} />
        <PlayerIdentity
          player={candidate}
          trailing={
            <div className="flex items-center gap-1.5">
              <PriceTrendBadge candidate={candidate} />
              <PlayerPrice
                priceCents={candidate.priceCents}
                className="text-base"
              />
            </div>
          }
        />
      </div>

      <div
        className={cn(
          "flex items-center gap-3 border-t border-border pt-2.5",
          blocked ? "justify-between" : "justify-end",
        )}
      >
        {blocked && (
          <Badge variant="outline" className="text-[10px]">
            {blockReasonLabel(verdict.blockedBy!)}
          </Badge>
        )}

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
          {blockReasonMessage(verdict.blockedBy!)}
        </p>
      )}
    </li>
  );
}
