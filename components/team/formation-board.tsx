import { Plus, TriangleAlert } from "lucide-react";

import { PlayerPhoto } from "@/components/player/player-photo";
import { PlayerScore } from "@/components/team/player-score";
import type { RosterSlot } from "@/lib/team/types";
import { cn } from "@/lib/utils";

type Position = {
  top: string;
  left: string;
  /** Qual borda do marcador se apoia em `left`. */
  anchor: "left" | "center" | "right";
};

/** Posições em losango, na ordem das vagas da escalação. */
const POSITIONS: Position[] = [
  { top: "6%", left: "50%", anchor: "center" },
  { top: "30%", left: "16%", anchor: "left" },
  { top: "26%", left: "78%", anchor: "right" },
  { top: "60%", left: "4%", anchor: "left" },
  { top: "64%", left: "98%", anchor: "right" },
];

const anchorTransform = {
  left: undefined,
  center: "translateX(-50%)",
  right: "translateX(-100%)",
} as const;

function Marker({
  slot,
  position,
  index,
  onSelect,
  selected = false,
  onSetCaptain,
}: {
  slot: RosterSlot;
  position: Position;
  index: number;
  /** Presente só quando a vaga pode abrir o mercado (janela aberta). */
  onSelect?: (index: number) => void;
  selected?: boolean;
  /** Presente só quando o usuário pode trocar o capitão (mercado aberto). */
  onSetCaptain?: (index: number) => void;
}) {
  const { player, captain, warning } = slot;

  // Vaga cheia e vaga vazia são estados distintos o bastante para não
  // dividirem um `cn()` só — separá-los tira cinco guardas `player &&`.
  const circle = player ? (
    <PlayerPhoto
      photoUrl={player.photoUrl}
      nickname={player.nickname}
      shape="circle"
      size={56}
      className={cn(
        "ring-2",
        captain ? "ring-primary" : "ring-border",
        // O tabuleiro não pode contradizer a lista: o mesmo alerta de
        // `PlayerWarningBadge` (`components/team/player-row.tsx`) também
        // marca o círculo aqui.
        warning && "ring-destructive",
        selected && "ring-primary",
      )}
    />
  ) : (
    <div
      className={cn(
        "flex size-14 items-center justify-center rounded-full border border-dashed border-border text-border transition-colors",
        onSelect && "group-hover:border-primary group-hover:text-primary",
        selected && "border-primary text-primary",
      )}
    >
      <Plus aria-hidden className="size-5" />
    </div>
  );

  return (
    <div
      style={{
        top: position.top,
        left: position.left,
        transform: anchorTransform[position.anchor],
      }}
      className="absolute flex flex-col items-center gap-[5px]"
    >
      <div className="relative">
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(index)}
            aria-haspopup="dialog"
            aria-expanded={selected}
            aria-label={
              player
                ? `Substituir ${player.nickname} no campo`
                : `Adicionar jogador na vaga ${index + 1} no campo`
            }
            className="group block cursor-pointer rounded-full transition-transform hover:scale-105"
          >
            {circle}
          </button>
        ) : (
          circle
        )}
        {player &&
          (onSetCaptain ? (
            <button
              type="button"
              onClick={() => onSetCaptain(index)}
              aria-pressed={captain}
              aria-label={
                captain
                  ? `${player.nickname} é o capitão no campo`
                  : `Tornar ${player.nickname} capitão no campo`
              }
              title={captain ? "Capitão" : "Tornar capitão"}
              className={cn(
                "absolute -top-1 -left-1 flex size-[18px] cursor-pointer items-center justify-center rounded-full text-[9px] font-extrabold transition-colors",
                captain
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground",
              )}
            >
              C
            </button>
          ) : (
            captain && (
              <span
                aria-label="Capitão"
                title="Capitão"
                className="absolute -top-1 -left-1 flex size-[18px] items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-primary-foreground"
              >
                C
              </span>
            )
          ))}
        {player && warning && (
          <span
            aria-label="Fora do escopo do time"
            title="Fora do escopo do time"
            className="absolute -top-1 -right-1 flex size-[18px] items-center justify-center rounded-full bg-card text-destructive ring-1 ring-destructive"
          >
            <TriangleAlert aria-hidden className="size-2.5" />
          </span>
        )}
      </div>

      {player ? (
        <>
          <PlayerScore score={player.score} surface="card" size="sm" />
          <p className="text-[11px] font-bold uppercase">{player.nickname}</p>
        </>
      ) : (
        <p className="text-[11px] font-semibold text-muted-foreground">
          Slot {index + 1}
        </p>
      )}
    </div>
  );
}

export type FormationBoardProps = {
  roster: RosterSlot[];
  /** Presente só quando a vaga pode abrir o mercado (janela aberta). */
  onSelect?: (index: number) => void;
  selectedIndex?: number | null;
  /** Presente só quando o usuário pode trocar o capitão (mercado aberto). */
  onSetCaptain?: (index: number) => void;
};

/** O time disposto em campo, como o usuário o montou. */
export function FormationBoard({
  roster,
  onSelect,
  selectedIndex = null,
  onSetCaptain,
}: FormationBoardProps) {
  return (
    <div className="relative w-full overflow-hidden bg-card pt-[78%] ring-1 ring-border">
      {roster.slice(0, POSITIONS.length).map((slot, index) => (
        <Marker
          key={slot.player?.id ?? `slot-${index}`}
          slot={slot}
          position={POSITIONS[index]}
          index={index}
          onSelect={onSelect}
          selected={index === selectedIndex}
          onSetCaptain={onSetCaptain}
        />
      ))}
    </div>
  );
}
