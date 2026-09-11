import { PlayerPhoto } from "@/components/player/player-photo";
import { PlayerIdentity } from "@/components/team/player-row";
import { formatCreditsDelta } from "@/lib/market/money";
import type { PriceMover } from "@/lib/round/types";
import { cn } from "@/lib/utils";

export type PriceMoverListProps = {
  title: string;
  movers: PriceMover[];
  /** `positive` para valorizações, `negative` para desvalorizações. */
  tone: "positive" | "negative";
};

/** Lista compacta de quem mais valorizou — ou desvalorizou — na rodada. */
export function PriceMoverList({ title, movers, tone }: PriceMoverListProps) {
  return (
    <section className="bg-card p-4 ring-1 ring-border">
      <h2 className="mb-3 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>

      {movers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum jogador se destacou nesta rodada.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {movers.map((mover) => (
            <li key={mover.playerId} className="flex items-center gap-2.5">
              <PlayerPhoto
                photoUrl={mover.photoUrl}
                nickname={mover.nickname}
                size={28}
              />
              <PlayerIdentity
                player={{
                  nickname: mover.nickname,
                  team: mover.team,
                  role: mover.role,
                  // Não lido: `trailing` abaixo sempre sobrescreve a
                  // pontuação padrão de `PlayerIdentity` pela variação de preço.
                  score: 0,
                }}
                trailing={
                  <span
                    className={cn(
                      "flex-none font-bold tabular-nums",
                      tone === "positive" ? "text-success" : "text-destructive",
                    )}
                  >
                    {formatCreditsDelta(mover.priceDeltaCents)}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
