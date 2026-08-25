import { ThumbsDown, ThumbsUp } from "lucide-react";

import { formatScore } from "@/lib/team/score";
import type { Player } from "@/lib/team/types";
import { cn } from "@/lib/utils";

export type ScorerHighlightProps = {
  title: string;
  player: Player | null;
  /** `true` para o maior pontuador, `false` para o menor. */
  positive: boolean;
};

/** Destaque do jogador que mais — ou menos — rendeu na rodada. */
export function ScorerHighlight({
  title,
  player,
  positive,
}: ScorerHighlightProps) {
  const Icon = positive ? ThumbsUp : ThumbsDown;

  return (
    <section className="bg-card p-4 ring-1 ring-border">
      <h2 className="mb-3 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>

      {player ? (
        <div className="flex items-center gap-3">
          <div className="clip-corner size-13 flex-none [--clip:6px] [background-image:repeating-linear-gradient(135deg,var(--accent)_0_4px,var(--muted)_4px_8px)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold uppercase">
              {player.nickname}
            </p>
            <p className="mt-px text-[11px] font-semibold text-muted-foreground">
              {player.role}
            </p>
          </div>
          <div className="flex items-center gap-[7px]">
            <span
              className={cn(
                "flex size-7 flex-none items-center justify-center rounded-full",
                positive ? "bg-success/20" : "bg-primary/20",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-3.5",
                  positive ? "text-success" : "text-primary",
                )}
              />
            </span>
            <span
              className={cn(
                "text-xl font-extrabold tabular-nums",
                positive ? "text-success" : "text-primary",
              )}
            >
              {formatScore(player.score)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Escale seu time para ver este destaque.
        </p>
      )}
    </section>
  );
}
