import { PlayerScore } from "@/components/team/player-score";
import type { Player } from "@/lib/team/types";
import { cn } from "@/lib/utils";

function CaptainBadge({ className }: { className?: string }) {
  return (
    <span
      aria-label="Capitão"
      title="Capitão"
      className={cn(
        "absolute -top-1 -left-1 flex size-4 items-center justify-center bg-primary text-[9px] font-extrabold text-primary-foreground",
        className,
      )}
    >
      C
    </span>
  );
}

/** Retrato do jogador. Placeholder hachurado até existirem imagens. */
function PlayerPortrait({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "clip-corner bg-accent [--clip:6px] [background-image:repeating-linear-gradient(135deg,var(--accent)_0_4px,var(--muted)_4px_8px)]",
        className,
      )}
    />
  );
}

export type PlayerIdentityProps = {
  player: Player;
  captain?: boolean;
};

/**
 * Retrato, identidade e pontuação de um jogador. Miolo de `PlayerRow`,
 * extraído para que a linha possa alternar entre `<div>` (só exibição) e
 * `<button>` (selecionável no mercado) sem duplicar esse markup.
 */
export function PlayerIdentity({ player, captain = false }: PlayerIdentityProps) {
  return (
    <>
      <div className="relative flex-none">
        <PlayerPortrait className="size-[46px]" />
        {captain && <CaptainBadge />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold uppercase">
          {player.nickname}
        </p>
        <p className="mt-[3px] flex items-center gap-1.5">
          <span className="bg-card px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {player.team}
          </span>
          <span className="text-[10px] font-semibold text-info uppercase">
            {player.agent} · {player.role}
          </span>
        </p>
      </div>

      <PlayerScore
        score={player.score}
        surface="secondary"
        className="clip-corner flex-none [--clip:6px]"
      />
    </>
  );
}

export type PlayerRowProps = {
  player: Player;
  captain?: boolean;
  /** Presente só quando a vaga pode abrir o mercado (janela aberta). */
  onSelect?: () => void;
  selected?: boolean;
};

/**
 * Linha compacta de jogador: retrato, identidade e pontuação. Compartilhada
 * entre "Meu Time" e o mercado de transferências. Sem `onSelect` é uma linha
 * inerte; com `onSelect` vira um botão que abre o mercado para essa vaga.
 */
export function PlayerRow({
  player,
  captain = false,
  onSelect,
  selected = false,
}: PlayerRowProps) {
  const identity = <PlayerIdentity player={player} captain={captain} />;

  return (
    <li
      className={cn(
        "clip-corner bg-secondary ring-1 [--clip:10px]",
        captain ? "ring-primary/40" : "ring-border",
        selected && "ring-primary",
      )}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-haspopup="dialog"
          aria-expanded={selected}
          aria-label={`Substituir ${player.nickname}`}
          className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]"
        >
          {identity}
        </button>
      ) : (
        <div className="flex w-full items-center gap-2.5 px-3 py-2.5">
          {identity}
        </div>
      )}
    </li>
  );
}

/** Vaga ainda não preenchida na escalação. */
export function EmptyPlayerRow({ position }: { position: number }) {
  return (
    <li className="clip-corner flex items-center gap-2.5 border border-dashed border-border bg-secondary/40 px-3 py-2.5 [--clip:10px]">
      <span className="flex size-[46px] flex-none items-center justify-center text-xl font-bold text-border">
        {position}
      </span>
      <span className="text-xs text-muted-foreground">Slot vazio</span>
    </li>
  );
}
