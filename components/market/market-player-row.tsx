"use client";

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
import { expectedSeriesPoints } from "@/lib/scoring/pricing";
import type { Player } from "@/lib/team/types";
import { cn } from "@/lib/utils";

/**
 * Pontos por série que o preço do candidato promete
 * (`expectedSeriesPoints`, `lib/scoring/pricing.ts`) — a mesma régua que
 * `db/close-round.ts` usa para decidir se ele valoriza ou desvaloriza na
 * próxima rodada (Suposição S10, `.claude/plans/26-regras-de-preco-e-saldo.md`).
 * Substitui a seta "Valorizando/Desvalorizando" do plano 20: aquela previa o
 * preço pela forma das últimas 5 séries, e o motor novo não caminha mais até
 * esse alvo — mostrar a seta antiga passaria a mentir.
 */
function priceTrendLabel(priceCents: number): string {
  return `Valoriza com ${Math.ceil(expectedSeriesPoints(priceCents))}+ pts`;
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
            <div className="flex flex-col items-end gap-0.5">
              <PlayerPrice
                priceCents={candidate.priceCents}
                className="text-base"
              />
              <span
                title={`Precisa de ${Math.ceil(expectedSeriesPoints(candidate.priceCents))} pontos por série para valorizar`}
                className="text-[10px] font-semibold text-muted-foreground"
              >
                {priceTrendLabel(candidate.priceCents)}
              </span>
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
